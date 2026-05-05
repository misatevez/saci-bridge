import axios, { type AxiosInstance } from 'axios';

export interface V8ClientOptions {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface V8ListResponse {
  data: V8Record[];
  links?: {
    next?: string | null;
  };
  meta?: {
    total?: number;
  };
}

export interface V8Record {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

export class V8Client {
  private readonly opts: Required<V8ClientOptions>;
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private client: AxiosInstance;

  constructor(opts: V8ClientOptions) {
    this.opts = { timeoutMs: 15_000, ...opts };
    this.client = axios.create({
      baseURL: this.opts.baseUrl,
      timeout: this.opts.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    });

    const res = await axios.post<TokenResponse>(this.opts.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: this.opts.timeoutMs,
    });

    this.token = res.data.access_token;
    const expiresIn = res.data.expires_in ?? 3600;
    this.tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
    return this.token;
  }

  async fetchAll(module: string, fields: string[]): Promise<V8Record[]> {
    const records: V8Record[] = [];
    let pageNumber = 1;
    const pageSize = 100;

    while (true) {
      const token = await this.getToken();
      const res = await this.client.get<V8ListResponse>(`/module/${module}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: Object.assign(
          { 'page[size]': pageSize, 'page[number]': pageNumber },
          { [`fields[${module}]`]: fields.join(',') },
        ),
      });

      const data = res.data.data ?? [];
      records.push(...data);

      if (data.length < pageSize) break;
      pageNumber++;
    }

    return records;
  }

  async patch(module: string, id: string, attributes: Record<string, unknown>): Promise<void> {
    const token = await this.getToken();
    await this.client.patch(
      `/module/${module}/${id}`,
      {
        data: {
          type: module,
          id,
          attributes,
        },
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }
}
