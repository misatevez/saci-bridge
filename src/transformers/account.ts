import type { SaciCliente, TransformResult } from './types.js';

export interface AccountPayload {
  id: string;
  name: string;
  billing_address_street?: string;
  billing_address_city?: string;
  billing_address_country?: string;
  email1?: string;
  phone_office?: string;
  account_type?: string;
  sic_code?: string;
}

/**
 * @param saciId - Existing SaciERP client ID; when provided, generates a PATCH request.
 */
export function transformAccount(payload: AccountPayload, saciId?: string | null): TransformResult {
  const address = [
    payload.billing_address_street,
    payload.billing_address_city,
    payload.billing_address_country,
  ]
    .filter(Boolean)
    .join(', ');

  const cliente: SaciCliente = {
    identificationType: payload.account_type ?? 'RUC',
    identification: payload.sic_code ?? payload.id,
    socialReason: payload.name,
    email: payload.email1,
    phone: payload.phone_office,
    address: address || undefined,
  };

  if (saciId) {
    return { endpoint: `/clientes/${saciId}`, method: 'PATCH', payload: cliente };
  }
  return { endpoint: '/clientes', method: 'POST', payload: cliente };
}
