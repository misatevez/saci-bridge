import axios, { isAxiosError } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';
import { getToken } from './auth.js';

interface ApiListResponse<T = unknown> {
  data: T[];
  meta: {
    total_count?: number;
    [key: string]: unknown;
  };
  links?: {
    next?: string;
    [key: string]: unknown;
  };
}

interface ApiSingleResponse<T = unknown> {
  data: T;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function getModule<T = unknown>(
  module: string,
  params?: Record<string, string | number>,
): Promise<ApiListResponse<T>> {
  const headers = await buildHeaders();

  try {
    const res = await axios.get<ApiListResponse<T>>(
      `${config.saciErp.apiUrl}/module/${module}`,
      { headers, params, timeout: 15_000 },
    );
    logger.debug({ module, count: res.data.data?.length }, 'GET module OK');
    return res.data;
  } catch (err) {
    const detail = isAxiosError(err) ? { status: err.response?.status, body: err.response?.data } : { error: String(err) };
    logger.error({ module, ...detail }, 'GET module failed');
    throw err;
  }
}

export async function getRecord<T = unknown>(
  module: string,
  id: string,
): Promise<ApiSingleResponse<T>> {
  const headers = await buildHeaders();

  try {
    const res = await axios.get<ApiSingleResponse<T>>(
      `${config.saciErp.apiUrl}/module/${module}/${id}`,
      { headers, timeout: 15_000 },
    );
    return res.data;
  } catch (err) {
    const detail = isAxiosError(err) ? { status: err.response?.status } : { error: String(err) };
    logger.error({ module, id, ...detail }, 'GET record failed');
    throw err;
  }
}

export async function createRecord<T = unknown>(
  module: string,
  attributes: Record<string, unknown>,
): Promise<ApiSingleResponse<T>> {
  const headers = await buildHeaders();

  const body = { data: { type: module, attributes } };
  try {
    const res = await axios.post<ApiSingleResponse<T>>(
      `${config.saciErp.apiUrl}/module/${module}`,
      body,
      { headers, timeout: 15_000 },
    );
    return res.data;
  } catch (err) {
    const detail = isAxiosError(err) ? { status: err.response?.status } : { error: String(err) };
    logger.error({ module, ...detail }, 'POST module failed');
    throw err;
  }
}

export async function updateRecord<T = unknown>(
  module: string,
  id: string,
  attributes: Record<string, unknown>,
): Promise<ApiSingleResponse<T>> {
  const headers = await buildHeaders();

  const body = { data: { type: module, id, attributes } };
  try {
    const res = await axios.patch<ApiSingleResponse<T>>(
      `${config.saciErp.apiUrl}/module/${module}/${id}`,
      body,
      { headers, timeout: 15_000 },
    );
    return res.data;
  } catch (err) {
    const detail = isAxiosError(err) ? { status: err.response?.status } : { error: String(err) };
    logger.error({ module, id, ...detail }, 'PATCH record failed');
    throw err;
  }
}
