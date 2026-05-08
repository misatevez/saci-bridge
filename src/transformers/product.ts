import type { SaciV8Record, TransformResult } from './types.js';

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
  const attributes: Record<string, unknown> = {
    name: payload.name,
    part_number: payload.sku_saci_c ?? payload.part_number ?? payload.id,
    price: String(payload.price ?? '0.00'),
    quantity: String(payload.quantity ?? '0'),
    status: payload.status ?? 'Active',
  };

  if (payload.description) attributes.description = payload.description;
  if (payload.category_id) attributes.category_id = payload.category_id;

  const v8Record: SaciV8Record = saciId
    ? { data: { type: 'AOS_Products', id: saciId, attributes } }
    : { data: { type: 'AOS_Products', attributes } };

  if (saciId) {
    return { endpoint: `/module/AOS_Products/${saciId}`, method: 'PATCH', payload: v8Record };
  }
  return { endpoint: '/module', method: 'POST', payload: v8Record };
}
