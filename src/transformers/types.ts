export interface SaciCliente {
  identificationType: string;
  identification: string;
  socialReason: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface SaciPedidoDetail {
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface SaciPedido {
  idDoc: string;
  emissionDate: string;
  identificationType: string;
  identification: string;
  socialReason: string;
  address: string;
  email: string;
  phone: string;
  details: SaciPedidoDetail[];
}

export interface SaciProducto {
  sku: string;
  nombre: string;
  precio: string;
  cantidad: string;
  categoria: string;
  estado: boolean;
}

export interface SaciV8Record {
  data: {
    type: string;
    id?: string;
    attributes: Record<string, unknown>;
  };
}

export type SaciPayload = SaciCliente | SaciPedido | SaciProducto | SaciV8Record;

export interface SendResult {
  endpoint: string;
  method: 'POST' | 'PATCH';
  payload: SaciPayload;
}

export interface SkipResult {
  skip: true;
  reason: string;
}

/** Dependency surface injected by the poller into complex multi-step handlers. */
export interface HandlerDeps {
  getSaciId(module: string, firmasId: string): Promise<string | null>;
  upsertMapping(module: string, firmasId: string, saciId: string): Promise<void>;
  callSaci(outboxId: string, method: 'POST' | 'PATCH', endpoint: string, payload: unknown): Promise<{ ok: boolean; status?: number | null; body?: unknown }>;
  queryFirmas<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
}

export interface HandlerResult {
  handle(outboxId: string, deps: HandlerDeps): Promise<{ ok: boolean }>;
}

export type TransformResult = SendResult | SkipResult | HandlerResult;
