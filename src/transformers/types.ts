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

export type SaciPayload = SaciCliente | SaciPedido | SaciProducto;

export interface TransformResult {
  endpoint: string;
  method: 'POST' | 'PATCH';
  payload: SaciPayload;
}
