import type { SaciV8Record, TransformResult } from './types.js';

export interface ContactPayload {
  id: string;
  first_name?: string;
  last_name: string;
  email1?: string;
  phone_mobile?: string;
  phone_work?: string;
  primary_address_street?: string;
  primary_address_city?: string;
  primary_address_country?: string;
  contact_type?: string;
  identification?: string;
}

export function transformContact(payload: ContactPayload, saciId?: string | null): TransformResult {
  const attributes: Record<string, unknown> = { last_name: payload.last_name };

  if (payload.first_name) attributes.first_name = payload.first_name;
  if (payload.email1) attributes.email1 = payload.email1;
  if (payload.phone_mobile) attributes.phone_mobile = payload.phone_mobile;
  else if (payload.phone_work) attributes.phone_work = payload.phone_work;
  if (payload.primary_address_street) attributes.primary_address_street = payload.primary_address_street;
  if (payload.primary_address_city) attributes.primary_address_city = payload.primary_address_city;
  if (payload.primary_address_country) attributes.primary_address_country = payload.primary_address_country;

  const v8Record: SaciV8Record = saciId
    ? { data: { type: 'Contacts', id: saciId, attributes } }
    : { data: { type: 'Contacts', attributes } };

  if (saciId) {
    return { endpoint: `/module/Contacts/${saciId}`, method: 'PATCH', payload: v8Record };
  }
  return { endpoint: '/module/Contacts', method: 'POST', payload: v8Record };
}
