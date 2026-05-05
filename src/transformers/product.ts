import type { SaciProducto, TransformResult } from './types.js';

export interface ProductPayload {
  id: string;
  name: string;
  description?: string;
  sku_saci_c?: string;
  price?: number | string;
  cost?: number | string;
  quantity?: number | string;
  category?: string;
  category_id?: string;
  part_number?: string;
  status?: string;
}

export function transformProduct(payload: ProductPayload, saciId?: string | null): TransformResult {
  const producto: SaciProducto = {
    sku: payload.sku_saci_c ?? payload.part_number ?? payload.id,
    nombre: payload.name,
    precio: String(payload.price ?? '0.00'),
    cantidad: String(payload.quantity ?? '0'),
    categoria: payload.category_id ?? payload.category ?? '001',
    estado: payload.status !== 'Inactive',
  };

  if (saciId) {
    return { endpoint: `/productos/${saciId}`, method: 'PATCH', payload: producto };
  }
  return { endpoint: '/productos', method: 'POST', payload: producto };
}
