import { config } from '../config.js';
import { logger } from '../logger.js';
import { pollInvoices } from './invoice-return.js';

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function tick(): Promise<void> {
  if (running) {
    logger.debug({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] Previous tick still running, skipping');
    return;
  }
  running = true;

  try {
    await pollInvoices();
  } catch (err) {
    logger.error({ '[RETURN-POLLER]': true, err }, '[RETURN-POLLER] Tick error');
  } finally {
    running = false;
  }
}

export function startReturnPoller(): void {
  logger.info(
    { '[RETURN-POLLER]': true, intervalMs: config.poller.intervalMs },
    '[RETURN-POLLER] Starting return poller',
  );

  const schedule = () => {
    tick().finally(() => {
      timer = setTimeout(schedule, config.poller.intervalMs);
    });
  };

  schedule();
}

export function stopReturnPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    logger.info({ '[RETURN-POLLER]': true }, '[RETURN-POLLER] Stopped');
  }
}
