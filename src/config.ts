import 'dotenv/config';

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  logLevel: string;
  saciErp: {
    apiUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
  };
  suitecrm: {
    baseUrl: string;
    oauthClientId: string;
    oauthClientSecret: string;
  };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  firmasDb: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  poller: {
    intervalMs: number;
    batchSize: number;
    maxRetries: number;
    backoffBaseMs: number;
  };
}

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  return '';
}

function readEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): Config {
  const nodeEnv = (readEnv('NODE_ENV', 'development') as Config['nodeEnv']);

  return {
    nodeEnv,
    port: readEnvInt('PORT', 3100),
    host: readEnv('HOST', '127.0.0.1'),
    logLevel: readEnv('LOG_LEVEL', 'info'),
    saciErp: {
      apiUrl: readEnv('SACIERP_API_URL', 'https://sacierp.moacrm.com/legacy/Api/V8'),
      tokenUrl: readEnv('SACIERP_TOKEN_URL', 'https://sacierp.moacrm.com/legacy/Api/access_token'),
      clientId: readEnv('SACIERP_CLIENT_ID'),
      clientSecret: readEnv('SACIERP_CLIENT_SECRET'),
    },
    suitecrm: {
      baseUrl: readEnv('SUITECRM_BASE_URL', 'https://firmas.moacrm.com'),
      oauthClientId: readEnv('SUITECRM_OAUTH_CLIENT_ID'),
      oauthClientSecret: readEnv('SUITECRM_OAUTH_CLIENT_SECRET'),
    },
    db: {
      host: readEnv('DB_HOST', '127.0.0.1'),
      port: readEnvInt('DB_PORT', 3306),
      user: readEnv('DB_USER'),
      password: readEnv('DB_PASS'),
      database: readEnv('DB_NAME', 'saci_bridge'),
    },
    firmasDb: {
      host: readEnv('FIRMAS_DB_HOST', '129.213.101.91'),
      port: readEnvInt('FIRMAS_DB_PORT', 3306),
      user: readEnv('FIRMAS_DB_USER', 'saci_bridge_reader'),
      password: readEnv('FIRMAS_DB_PASS'),
      database: readEnv('FIRMAS_DB_NAME', 'firmascrm'),
    },
    poller: {
      intervalMs: readEnvInt('POLL_INTERVAL_MS', 30_000),
      batchSize: readEnvInt('POLL_BATCH_SIZE', 50),
      maxRetries: readEnvInt('MAX_RETRIES', 5),
      backoffBaseMs: readEnvInt('BACKOFF_BASE_MS', 1_000),
    },
  };
}

export const config: Config = loadConfig();
