import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/** Returns a valid Bearer token for SaciERP API V8. */
export async function getSaciToken(): Promise<string> {
  const cfg = config.saciErp;

  // If no OAuth2 URL configured, fall back to static token
  if (!cfg.oauth2TokenUrl) {
    return cfg.apiToken;
  }

  const now = Date.now();
  // Refresh 60 seconds before expiry
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  logger.debug({ '[AUTH]': true }, '[AUTH] Fetching SaciERP OAuth2 token');

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: cfg.oauth2ClientId,
    client_secret: cfg.oauth2ClientSecret,
    username: cfg.oauth2Username,
    password: cfg.oauth2Password,
  });

  const res = await axios.post<TokenResponse>(
    cfg.oauth2TokenUrl,
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    },
  );

  cachedToken = res.data.access_token;
  tokenExpiresAt = now + res.data.expires_in * 1_000;

  logger.info(
    { '[AUTH]': true, expiresIn: res.data.expires_in },
    '[AUTH] SaciERP token acquired',
  );

  return cachedToken;
}

/** Invalidate cached token (call after 401 responses). */
export function invalidateToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}
