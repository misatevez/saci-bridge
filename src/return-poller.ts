import axios, { isAxiosError } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import { getToken } from './auth.js';
import { getFirmasId } from './db/id-mapping.js';
import { getFirmasPool } from './db/firmas.js';
import { pollInvoices } from './return-poller/invoice-return.js';
import type { ResultSetHeader } from 'mysql2/promise';

const MODULE = 'AOS_Products';
const FIELDS = ['name', 'price', 'sku_saci_c', 'date_modified'];

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastPollTimestamp: Date = new Date(0);

interface SaciV8Record {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface SaciV8ListResponse {
  data: SaciV8Record[];
}

function toMysqlDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

async function fetchSaciProductsModifiedSince(since: Date): Promise<SaciV8Record[]> {
  const token = await getToken();

  try {
    const res = await axios.get<SaciV8ListResponse>(`${config.saciErp.apiUrl}/module/${MODULE}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      params: {
        [`fields[${MODULE}]`]: FIELDS.join(','),
        'filter[date_modified][gte]': toMysqlDatetime(since),
        'page[size]': 100,
      },
      timeout: 15_000,
    });

    return res.data.data ?? [];
  } catch (err) {
    const detail = isAxiosError(err)
      ? { status: err.response?.status, body: err.response?.data }
      : { error: String(err) };
    logger.error({ '[RETURN-POLLER]': true, ...detail }, '[RETURN-POLLER] Fetch failed');
    throw err;
  }
}

async function updateFirmasProduct(
  firmasId: string,
  stock: number | null,
  price: number | null,
): Promise<void> {
  const pool = getFirmasPool();
  const parts: string[] = [];
  const values: (number | string)[] = [];

  if (stock !== null) {
    parts.push('stock_disponible_c = ?');
    values.push(stock);
  }
  if (price !== null) {
    parts.push('precio_saci_c = ?');
    values.push(price);
  }

  if (parts.length === 0) return;

  values.push(firmasId);
  await pool.execute<ResultSetHeader>(
    `UPDATE aos_products_cstm SET ${parts.join(', ')} WHERE id_c = ?`,
    values,
  );
}

async function processSaciProducts(products: SaciV8Record[]): Promise<void> {
  for (const product of products) {
    const saciId = product.id;
    const attrs = product.attributes;

    const firmasId = await getFirmasId(MODULE, saciId);
    if (!firmasId) {
      logger.debug(
        { '[RETURN-POLLER]': true, saciId },
        '[RETURN-POLLER] No mapping found — skipping',
      );
      continue;
    }

    const stock = attrs['qty_in_stock'] != null ? Number(attrs['qty_in_stock']) : null;
    const price = attrs['price'] != null ? Number(attrs['price']) : null;

    try {
      await updateFirmasProduct(firmasId, stock, price);
      logger.info(
        { '[RETURN-POLLER]': true, saciId, firmasId, stock, price },
        '[RETURN-POLLER] Updated firmas product',
      );
    } catch (err) {
      logger.error(
        { '[RETURN-POLLER]': true, saciId, firmasId, err },
        '[RETURN-POLLER] Failed to update firmas product',
      );
    }
  }
}

async function poll(): Promise<void> {
  if (running) {
    logger.debug({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] Previous poll still running, skipping');
    return;
  }
  running = true;

  const since = lastPollTimestamp;
  const nextTimestamp = new Date();

  try {
    const products = await fetchSaciProductsModifiedSince(since);

    if (products.length > 0) {
      logger.info(
        { '[RETURN-POLLER]': true, count: products.length },
        '[RETURN-POLLER] Processing inbound products',
      );
      await processSaciProducts(products);
    } else {
      logger.debug({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] No modified products found');
    }

    lastPollTimestamp = nextTimestamp;
  } catch {
    // error already logged in fetchSaciProductsModifiedSince
  } finally {
    running = false;
  }

  // Invoice return channel: runs independently of products poll
  try {
    await pollInvoices();
  } catch (err) {
    logger.error({ '[RETURN-POLLER]': true, err }, '[RETURN-POLLER] Invoice poll error');
  }
}

export function startReturnPoller(intervalMs = 30_000): void {
  logger.info(
    { '[RETURN-POLLER]': true, intervalMs },
    '[RETURN-POLLER] Starting return poller',
  );

  const tick = () => {
    poll().finally(() => {
      timer = setTimeout(tick, intervalMs);
    });
  };

  tick();
}

export function stopReturnPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    logger.info({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] Stopped');
  }
}
