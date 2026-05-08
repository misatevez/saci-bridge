import type { SendResult } from './types.js';

export interface InvoiceLineItem {
  id?: string;
  name: string;
  product_id?: string;
  unit_price?: number | string;
  quantity?: number | string;
  total_amount?: number | string;
  unit_discount_amount?: number | string;
}

export interface InvoicePayload {
  id: string;
  name?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  status?: string;
  billing_account_id?: string;
  billing_contact_id?: string;
  quote_id?: string;
  subtotal_amount?: number | string;
  discount_amount?: number | string;
  tax_amount?: number | string;
  shipping_amount?: number | string;
  total_amount?: number | string;
  currency_id?: string;
  description?: string;
  line_items?: InvoiceLineItem[];
}

export interface InvoiceResolvedIds {
  saciAccountId?: string | null;
  saciContactId?: string | null;
  saciQuoteId?: string | null;
}

function toDecimalStr(v: number | string | undefined | null): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : undefined;
}

function buildAttributes(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export function transformInvoice(
  payload: InvoicePayload,
  saciId?: string | null,
  resolved?: InvoiceResolvedIds,
): SendResult {
  const attributes = buildAttributes({
    name: payload.name ?? payload.invoice_number ?? payload.id,
    invoice_number: payload.invoice_number,
    date_entered: payload.invoice_date,
    due_date: payload.due_date,
    status: payload.status ?? 'Unpaid',
    billing_account_id: resolved?.saciAccountId ?? payload.billing_account_id,
    billing_contact_id: resolved?.saciContactId ?? payload.billing_contact_id,
    quote_id: resolved?.saciQuoteId ?? payload.quote_id,
    subtotal_amount: toDecimalStr(payload.subtotal_amount),
    discount_amount: toDecimalStr(payload.discount_amount),
    tax_amount: toDecimalStr(payload.tax_amount),
    shipping_amount: toDecimalStr(payload.shipping_amount),
    total_amount: toDecimalStr(payload.total_amount),
    currency_id: payload.currency_id,
    description: payload.description,
  });

  if (saciId) {
    return {
      endpoint: `/module/AOS_Invoices/${saciId}`,
      method: 'PATCH',
      payload: { data: { type: 'AOS_Invoices', id: saciId, attributes } },
    };
  }

  return {
    endpoint: '/module',
    method: 'POST',
    payload: { data: { type: 'AOS_Invoices', attributes } },
  };
}

export function transformInvoiceLineItem(
  item: InvoiceLineItem,
  saciInvoiceId: string,
  saciProductId?: string | null,
): SendResult {
  const attributes = buildAttributes({
    name: item.name,
    unit_price: toDecimalStr(item.unit_price),
    quantity: item.quantity !== undefined ? String(item.quantity) : '1',
    total_amount: toDecimalStr(item.total_amount),
    unit_discount_amount: toDecimalStr(item.unit_discount_amount),
    product_id: saciProductId ?? item.product_id,
    parent_type: 'AOS_Invoices',
    parent_id: saciInvoiceId,
  });

  if (item.id) {
    return {
      endpoint: `/module/AOS_Products_Quotes/${item.id}`,
      method: 'PATCH',
      payload: { data: { type: 'AOS_Products_Quotes', id: item.id, attributes } },
    };
  }

  return {
    endpoint: '/module',
    method: 'POST',
    payload: { data: { type: 'AOS_Products_Quotes', attributes } },
  };
}
