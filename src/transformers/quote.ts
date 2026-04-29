import type { SaciPedido, SaciPedidoDetail, TransformResult } from './types.js';

export interface QuoteLineItem {
  sku?: string;
  product_id?: string;
  name: string;
  quantity: number | string;
  unit_price: number | string;
  total_amount?: number | string;
}

export interface QuotePayload {
  id: string;
  quote_num?: string;
  date_quote_expected_closed?: string;
  date_entered?: string;
  billing_account_name?: string;
  billing_account_id?: string;
  billing_contact_first_name?: string;
  billing_contact_last_name?: string;
  billing_address_street?: string;
  billing_address_city?: string;
  billing_address_country?: string;
  billing_contact_email?: string;
  billing_contact_phone?: string;
  identification_type?: string;
  identification?: string;
  line_items?: QuoteLineItem[];
}

function toNumber(v: number | string | undefined, fallback = 0): number {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function transformQuote(payload: QuotePayload): TransformResult {
  const emissionDate =
    payload.date_quote_expected_closed ??
    payload.date_entered ??
    new Date().toISOString().slice(0, 10);

  const socialReason =
    payload.billing_account_name ??
    [payload.billing_contact_first_name, payload.billing_contact_last_name]
      .filter(Boolean)
      .join(' ') ??
    'Unknown';

  const address = [
    payload.billing_address_street,
    payload.billing_address_city,
    payload.billing_address_country,
  ]
    .filter(Boolean)
    .join(', ');

  const details: SaciPedidoDetail[] = (payload.line_items ?? []).map((item) => {
    const qty = toNumber(item.quantity, 1);
    const unitPrice = toNumber(item.unit_price);
    return {
      sku: item.sku ?? item.product_id ?? 'UNKNOWN',
      nombre: item.name,
      cantidad: qty,
      precioUnitario: unitPrice,
      total: toNumber(item.total_amount, qty * unitPrice),
    };
  });

  // DISCREPANCY NOTE: client doc shows details as object; we send as array.
  // Tracked in docs/sprint1/saci-api-discrepancies.md. If SaciERP rejects, escalate.
  const pedido: SaciPedido = {
    idDoc: payload.quote_num ?? payload.id,
    emissionDate,
    identificationType: payload.identification_type ?? 'RUC',
    identification: payload.identification ?? payload.billing_account_id ?? payload.id,
    socialReason,
    address: address || '',
    email: payload.billing_contact_email ?? '',
    phone: payload.billing_contact_phone ?? '',
    details,
  };

  return { endpoint: '/pedidos', method: 'POST', payload: pedido };
}
