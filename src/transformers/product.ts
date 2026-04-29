import type { SaciProducto, TransformResult } from './types.js';

export interface ProductPayload {
  id: string;
  name: string;
  sku_saci_c?: string;
  price?: number | string;
  quantity?: number | string;
  category?: string;
  status?: string;
}

export function transformProduct(payload: ProductPayload): TransformResult {
  const producto: SaciProducto = {
    sku: payload.sku_saci_c ?? payload.id,
    nombre: payload.name,
    precio: String(payload.price ?? '0.00'),
    cantidad: String(payload.quantity ?? '0'),
    categoria: payload.category ?? '001',
    estado: payload.status !== 'Inactive',
  };

  return { endpoint: '/productos', method: 'POST', payload: producto };
}
