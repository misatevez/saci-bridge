import axios, { type AxiosResponse, isAxiosError } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import { getToken, invalidateToken } from './auth.js';
import type { SaciPayload } from './transformers/types.js';

export type { SaciPayload };

export type HttpMethod = 'POST' | 'PATCH';

export type HttpOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown; retryable: false }
  | { ok: false; status: null; error: string; retryable: true };

const TIMEOUT_MS = 10_000;

async function buildClient() {
  const token = await getToken();
  return axios.create({
    baseURL: config.saciErp.apiUrl,
    timeout: TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function callSaci(
  outboxId: string,
  method: HttpMethod,
  endpoint: string,
  payload: SaciPayload | unknown,
): Promise<HttpOutcome> {
  const client = await buildClient();

  try {
    let res: AxiosResponse;
    if (method === 'PATCH') {
      res = await client.patch(endpoint, payload, {
        headers: { 'X-Idempotency-Key': outboxId },
      });
    } else {
      res = await client.post(endpoint, payload, {
        headers: { 'X-Idempotency-Key': outboxId },
      });
    }
    logger.info(
      { '[SACI-POLLER]': true, outboxId, method, endpoint, status: res.status },
      '[SACI-POLLER] Call success',
    );
    return { ok: true, status: res.status, body: res.data };
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      const { status, data } = err.response;

      // Invalidate cached token on 401 so next retry gets a fresh one
      if (status === 401) {
        invalidateToken();
      }

      logger.warn(
        { '[SACI-POLLER]': true, outboxId, method, endpoint, status, body: data },
        '[SACI-POLLER] HTTP error',
      );
      if (status >= 400 && status < 500) {
        return { ok: false, status, body: data, retryable: false };
      }
      return { ok: false, status: null, error: `HTTP ${status}`, retryable: true };
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { '[SACI-POLLER]': true, outboxId, method, endpoint, error: message },
      '[SACI-POLLER] Network error',
    );
    return { ok: false, status: null, error: message, retryable: true };
  }
}

/** @deprecated Use callSaci instead */
export async function postToSaci(
  outboxId: string,
  endpoint: string,
  payload: SaciPayload,
): Promise<HttpOutcome> {
  return callSaci(outboxId, 'POST', endpoint, payload);
}

export function computeNextRetry(retryCount: number, backoffBaseMs: number): Date {
  const delayMs = backoffBaseMs * Math.pow(2, retryCount);
  return new Date(Date.now() + delayMs);
}
