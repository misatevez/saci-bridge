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

export type TransformResult = SendResult | SkipResult;
