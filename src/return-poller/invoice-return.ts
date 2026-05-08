import { randomUUID } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getToken, invalidateToken } from '../auth.js';
import { getFirmasPool } from '../db/firmas.js';
import { getFirmasId, upsertMapping } from '../db/id-mapping.js';
import { getLastPollTime, setLastPollTime } from '../db/return-state.js';
import axios, { isAxiosError } from 'axios';

const MODULE = 'AOS_Invoices';
const FIELDS = 'name,billing_account_id,total_amount,status,due_date,date_modified,date_entered';

interface SaciInvoice {
  id: string;
  attributes: {
    name?: string;
    billing_account_id?: string;
    total_amount?: string | number;
    status?: string;
    due_date?: string;
    date_modified?: string;
    date_entered?: string;
  };
}

interface V8ListResponse {
  data: SaciInvoice[];
  links?: { next?: string | null };
}

async function fetchInvoicesSince(since: Date | null): Promise<SaciInvoice[]> {
  const token = await getToken();
  const client = axios.create({
    baseURL: config.saciErp.apiUrl,
    timeout: 15_000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  const records: SaciInvoice[] = [];
  let pageNumber = 1;
  const pageSize = 100;

  while (true) {
    const params: Record<string, string | number> = {
      [`fields[${MODULE}]`]: FIELDS,
      'page[size]': pageSize,
      'page[number]': pageNumber,
    };

    if (since) {
      // SuiteCRM V8 filter syntax
      params['filter[operator]'] = 'and';
      params[`filter[${MODULE}.date_modified][gte]`] = formatDatetime(since);
    }

    try {
      const res = await client.get<V8ListResponse>(`/module/${MODULE}`, { params });
      const batch = res.data.data ?? [];
      records.push(...batch);
      if (batch.length < pageSize) break;
      pageNumber++;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        invalidateToken();
      }
      throw err;
    }
  }

  return records;
}

function formatDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function resolveAccountId(saciAccountId: string | undefined): Promise<string | undefined> {
  if (!saciAccountId) return undefined;
  const firmasId = await getFirmasId('Accounts', saciAccountId);
  if (!firmasId) {
    logger.warn(
      { '[RETURN-POLLER]': true, saciAccountId },
      '[RETURN-POLLER] Account mapping not found — invoice will have no billing_account_id',
    );
  }
  return firmasId ?? undefined;
}

async function resolveQuoteId(saciQuoteId: string | undefined): Promise<string | undefined> {
  if (!saciQuoteId) return undefined;
  const firmasId = await getFirmasId('AOS_Quotes', saciQuoteId);
  if (!firmasId) {
    logger.warn(
      { '[RETURN-POLLER]': true, saciQuoteId },
      '[RETURN-POLLER] Quote mapping not found — invoice will not be linked to quote',
    );
  }
  return firmasId ?? undefined;
}

async function upsertInvoiceInFirmas(invoice: SaciInvoice): Promise<void> {
  const saciId = invoice.id;
  const attrs = invoice.attributes;

  const firmasId = await getFirmasId(MODULE, saciId);

  if (firmasId) {
    // Update existing invoice: only sync status and total_amount to avoid overwriting local edits
    await updateInvoice(firmasId, attrs);
    logger.info(
      { '[RETURN-POLLER]': true, firmasId, saciId },
      '[RETURN-POLLER] Invoice updated',
    );
    return;
  }

  // Create new invoice in firmas
  const [billingAccountId, quoteId] = await Promise.all([
    resolveAccountId(attrs.billing_account_id),
    resolveQuoteId(undefined),
  ]);

  const newId = randomUUID();
  await createInvoice(newId, attrs, billingAccountId, quoteId, saciId);
  await upsertMapping(MODULE, newId, saciId);

  logger.info(
    { '[RETURN-POLLER]': true, firmasId: newId, saciId, quoteLinked: !!quoteId },
    '[RETURN-POLLER] Invoice created',
  );
}

async function createInvoice(
  firmasId: string,
  attrs: SaciInvoice['attributes'],
  billingAccountId: string | undefined,
  quoteId: string | undefined,
  saciId: string,
): Promise<void> {
  const pool = getFirmasPool();
  const now = new Date();

  // Write directly to DB — bypasses after_save hooks to prevent outbox loop
  await pool.execute<ResultSetHeader>(
    `INSERT INTO aos_invoices
       (id, name, billing_account_id, total_amount, total_amount_usdollar,
        status, due_date, currency_id, date_entered, date_modified,
        created_by, modified_user_id, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, '-99', ?, ?, '1', '1', 0)`,
    [
      firmasId,
      attrs.name ?? `INV-${saciId.slice(0, 8)}`,
      billingAccountId ?? null,
      toDecimal(attrs.total_amount),
      toDecimal(attrs.total_amount),
      attrs.status ?? 'Draft',
      attrs.due_date ?? null,
      attrs.date_entered ? new Date(attrs.date_entered) : now,
      now,
    ],
  );

  // Write external_id_c to cstm table so reconcile script can match later
  try {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO aos_invoices_cstm (id_c, external_id_c) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE external_id_c = VALUES(external_id_c)`,
      [firmasId, saciId],
    );
  } catch {
    // _cstm table might not exist in all envs; non-fatal
  }
}

async function updateInvoice(
  firmasId: string,
  attrs: SaciInvoice['attributes'],
): Promise<void> {
  const pool = getFirmasPool();

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (attrs.status !== undefined) {
    updates.push('status = ?');
    values.push(attrs.status);
  }
  if (attrs.total_amount !== undefined) {
    updates.push('total_amount = ?, total_amount_usdollar = ?');
    values.push(toDecimal(attrs.total_amount), toDecimal(attrs.total_amount));
  }

  if (updates.length === 0) return;

  updates.push('date_modified = NOW()');
  values.push(firmasId);

  await pool.execute<ResultSetHeader>(
    `UPDATE aos_invoices SET ${updates.join(', ')} WHERE id = ? AND deleted = 0`,
    values,
  );
}

function toDecimal(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return Number.isFinite(n) ? n : 0;
}

export async function pollInvoices(): Promise<void> {
  const since = await getLastPollTime(MODULE);
  const pollStart = new Date();

  let invoices: SaciInvoice[];
  try {
    invoices = await fetchInvoicesSince(since);
  } catch (err) {
    logger.error(
      { '[RETURN-POLLER]': true, err },
      '[RETURN-POLLER] Failed to fetch invoices from SaciERP',
    );
    return;
  }

  if (invoices.length === 0) {
    logger.debug({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] No new invoices');
    await setLastPollTime(MODULE, pollStart);
    return;
  }

  logger.info(
    { '[RETURN-POLLER]': true, count: invoices.length },
    '[RETURN-POLLER] Processing invoices',
  );

  let processed = 0;
  let errors = 0;

  for (const invoice of invoices) {
    try {
      await upsertInvoiceInFirmas(invoice);
      processed++;
    } catch (err) {
      errors++;
      logger.error(
        { '[RETURN-POLLER]': true, saciId: invoice.id, err },
        '[RETURN-POLLER] Failed to upsert invoice',
      );
    }
  }

  await setLastPollTime(MODULE, pollStart);

  logger.info(
    { '[RETURN-POLLER]': true, processed, errors },
    '[RETURN-POLLER] Batch complete',
  );
}
