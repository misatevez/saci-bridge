import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
  obtainedAt: number;
}

let cached: CachedToken | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const REFRESH_MARGIN_MS = 60_000;

async function fetchToken(): Promise<CachedToken> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.saciErp.clientId,
    client_secret: config.saciErp.clientSecret,
  });

  const res = await axios.post<TokenResponse>(config.saciErp.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  const { access_token, expires_in } = res.data;
  const now = Date.now();

  logger.info(
    { expiresIn: expires_in },
    `Token obtained, expires in ${expires_in}s`,
  );

  return {
    value: access_token,
    expiresAt: now + expires_in * 1_000,
    obtainedAt: now,
  };
}

function scheduleRefresh(token: CachedToken): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  const msUntilRefresh = token.expiresAt - Date.now() - REFRESH_MARGIN_MS;
  const delay = Math.max(msUntilRefresh, 1_000);

  refreshTimer = setTimeout(async () => {
    try {
      cached = await fetchToken();
      scheduleRefresh(cached);
    } catch (err) {
      logger.error({ err }, 'Token refresh failed — will retry in 30s');
      refreshTimer = setTimeout(async () => {
        try {
          cached = await fetchToken();
          if (cached) scheduleRefresh(cached);
        } catch (retryErr) {
          logger.fatal({ err: retryErr }, 'Token refresh retry failed');
        }
      }, 30_000);
    }
  }, delay);
}

export async function getToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.value;
  }

  cached = await fetchToken();
  scheduleRefresh(cached);
  return cached.value;
}

export function getLastTokenInfo(): { obtainedAt: number | null; expiresAt: number | null } {
  if (!cached) return { obtainedAt: null, expiresAt: null };
  return { obtainedAt: cached.obtainedAt, expiresAt: cached.expiresAt };
}

export function stopTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
