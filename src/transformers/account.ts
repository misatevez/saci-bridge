import type { SaciV8Record, TransformResult } from './types.js';

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

export function transformAccount(payload: AccountPayload, saciId?: string | null): TransformResult {
  const attributes: Record<string, unknown> = { name: payload.name };

  if (payload.billing_address_street) attributes.billing_address_street = payload.billing_address_street;
  if (payload.billing_address_city) attributes.billing_address_city = payload.billing_address_city;
  if (payload.billing_address_country) attributes.billing_address_country = payload.billing_address_country;
  if (payload.email1) attributes.email1 = payload.email1;
  if (payload.phone_office) attributes.phone_office = payload.phone_office;
  if (payload.account_type) attributes.account_type = payload.account_type;
  if (payload.sic_code) attributes.sic_code = payload.sic_code;

  const v8Record: SaciV8Record = saciId
    ? { data: { type: 'Accounts', id: saciId, attributes } }
    : { data: { type: 'Accounts', attributes } };

  if (saciId) {
    return { endpoint: `/module/Accounts/${saciId}`, method: 'PATCH', payload: v8Record };
  }
  return { endpoint: '/module', method: 'POST', payload: v8Record };
}
