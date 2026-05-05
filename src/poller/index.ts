import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  fetchPendingRows,
  markInFlight,
  markSent,
  markFailed,
  incrementRetry,
} from '../db/outbox.js';
import { getSaciId, upsertMapping } from '../db/id-mapping.js';
import { transform } from '../transformers/index.js';
import { callSaci, computeNextRetry } from '../saci-client.js';

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function processRow(row: Awaited<ReturnType<typeof fetchPendingRows>>[number]): Promise<void> {
  logger.info(
    { '[SACI-POLLER]': true, id: row.id, module: row.target_module, recordId: row.record_id },
    '[SACI-POLLER] Processing',
  );

  // Look up existing SaciERP ID to decide POST vs PATCH
  const saciId = await getSaciId(row.target_module, row.record_id);

  let transformResult;
  try {
    transformResult = transform(row.target_module, row.payload_json, saciId);
  } catch (err) {
    logger.error(
      { '[SACI-POLLER]': true, id: row.id, module: row.target_module, err },
      '[SACI-POLLER] Transform error — marking failed',
    );
    await markFailed(row.id);
    return;
  }

  await markInFlight(row.id);

  const outcome = await callSaci(
    row.id,
    transformResult.method,
    transformResult.endpoint,
    transformResult.payload,
  );

  if (outcome.ok) {
    await markSent(row.id);

    // Store the SaciERP ID returned on creation for future upserts
    if (transformResult.method === 'POST' && outcome.body && typeof outcome.body === 'object') {
      const body = outcome.body as Record<string, unknown>;
      const returnedId =
        (body['idCliente'] as string | undefined) ??
        (body['idPedido'] as string | undefined) ??
        (body['id'] as string | undefined);
      if (returnedId) {
        await upsertMapping(row.target_module, row.record_id, returnedId);
      }
    }

    logger.info(
      {
        '[SACI-POLLER]': true,
        id: row.id,
        module: row.target_module,
        method: transformResult.method,
        endpoint: transformResult.endpoint,
      },
      '[SACI-POLLER] Sent OK',
    );
    return;
  }

  if (!outcome.retryable) {
    await markFailed(row.id);
    logger.warn(
      { '[SACI-POLLER]': true, id: row.id, status: outcome.status, body: outcome.body },
      '[SACI-POLLER] 4xx — marking failed (manual fix required)',
    );
    return;
  }

  // Retryable (5xx / network error)
  const newRetryCount = row.retry_count + 1;
  if (newRetryCount > config.poller.maxRetries) {
    await markFailed(row.id);
    logger.error(
      { '[SACI-POLLER]': true, id: row.id, retries: newRetryCount },
      '[SACI-POLLER] Max retries exceeded — marking failed',
    );
  } else {
    const nextRetryAt = computeNextRetry(newRetryCount, config.poller.backoffBaseMs);
    await incrementRetry(row.id, newRetryCount, nextRetryAt);
    logger.warn(
      {
        '[SACI-POLLER]': true,
        id: row.id,
        retries: newRetryCount,
        nextRetryAt: nextRetryAt.toISOString(),
      },
      '[SACI-POLLER] Retryable error — scheduled retry',
    );
  }
}

async function processBatch(): Promise<void> {
  if (running) {
    logger.debug({ '[SACI-POLLER]': true }, '[SACI-POLLER] Previous batch still running, skipping tick');
    return;
  }
  running = true;

  try {
    const rows = await fetchPendingRows(config.poller.batchSize);

    if (rows.length === 0) {
      logger.debug({ '[SACI-POLLER]': true }, '[SACI-POLLER] No pending rows');
      return;
    }

    logger.info({ '[SACI-POLLER]': true, count: rows.length }, '[SACI-POLLER] Processing batch');

    for (const row of rows) {
      await processRow(row);
    }
  } catch (err) {
    logger.error({ '[SACI-POLLER]': true, err }, '[SACI-POLLER] Batch error');
  } finally {
    running = false;
  }
}

export function startPoller(): void {
  logger.info(
    { '[SACI-POLLER]': true, intervalMs: config.poller.intervalMs },
    '[SACI-POLLER] Starting poller',
  );

  const tick = () => {
    processBatch().finally(() => {
      timer = setTimeout(tick, config.poller.intervalMs);
    });
  };

  tick();
}

export function stopPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    logger.info({ '[SACI-POLLER]': true }, '[SACI-POLLER] Stopped');
  }
}
