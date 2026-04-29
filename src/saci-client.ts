import axios, { type AxiosResponse, isAxiosError } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import type { SaciPayload } from './transformers/types.js';

export type HttpOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown; retryable: false }
  | { ok: false; status: null; error: string; retryable: true };

const TIMEOUT_MS = 10_000;

function buildClient() {
  return axios.create({
    baseURL: config.saciErp.apiUrl,
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.saciErp.apiToken}`,
    },
  });
}

export async function postToSaci(
  outboxId: string,
  endpoint: string,
  payload: SaciPayload,
): Promise<HttpOutcome> {
  const client = buildClient();

  try {
    const res: AxiosResponse = await client.post(endpoint, payload, {
      headers: { 'X-Idempotency-Key': outboxId },
    });
    logger.info(
      { '[SACI-POLLER]': true, outboxId, endpoint, status: res.status },
      '[SACI-POLLER] POST success',
    );
    return { ok: true, status: res.status, body: res.data };
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      const { status, data } = err.response;
      logger.warn(
        { '[SACI-POLLER]': true, outboxId, endpoint, status, body: data },
        '[SACI-POLLER] POST HTTP error',
      );
      // 4xx = non-retryable (bad payload, auth error)
      if (status >= 400 && status < 500) {
        return { ok: false, status, body: data, retryable: false };
      }
      // 5xx = retryable
      return { ok: false, status: null, error: `HTTP ${status}`, retryable: true };
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { '[SACI-POLLER]': true, outboxId, endpoint, error: message },
      '[SACI-POLLER] POST network error',
    );
    return { ok: false, status: null, error: message, retryable: true };
  }
}

export function computeNextRetry(retryCount: number, backoffBaseMs: number): Date {
  const delayMs = backoffBaseMs * Math.pow(2, retryCount);
  return new Date(Date.now() + delayMs);
}
