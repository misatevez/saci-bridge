import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  fetchPendingRows,
  markInFlight,
  markSent,
  markFailed,
  markSkipped,
  incrementRetry,
} from '../db/outbox.js';
import { transform } from '../transformers/index.js';
import { postToSaci, computeNextRetry } from '../saci-client.js';

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

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
      let transformResult;
      try {
        transformResult = transform(row.target_module, row.payload_json);
      } catch (err) {
        logger.error(
          { '[SACI-POLLER]': true, id: row.id, module: row.target_module, err },
          '[SACI-POLLER] Transform error — marking failed',
        );
        await markFailed(row.id);
        continue;
      }

      if ('skip' in transformResult) {
        await markSkipped(row.id);
        logger.info(
          { '[SACI-POLLER]': true, id: row.id, module: row.target_module, reason: transformResult.reason },
          '[SACI-POLLER] Skipped',
        );
        continue;
      }

      await markInFlight(row.id);

      const outcome = await postToSaci(row.id, transformResult.endpoint, transformResult.payload);

      if (outcome.ok) {
        await markSent(row.id);
        logger.info(
          { '[SACI-POLLER]': true, id: row.id, module: row.target_module, endpoint: transformResult.endpoint ?? '' },
          '[SACI-POLLER] Sent OK',
        );
        continue;
      }

      if (!outcome.retryable) {
        await markFailed(row.id);
        logger.warn(
          { '[SACI-POLLER]': true, id: row.id, status: outcome.status, body: outcome.body },
          '[SACI-POLLER] 4xx — marking failed (manual fix required)',
        );
        continue;
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
