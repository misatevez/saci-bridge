import type { SaciCliente, TransformResult } from './types.js';

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

export function transformContact(payload: ContactPayload): TransformResult {
  const fullName = [payload.first_name, payload.last_name].filter(Boolean).join(' ');

  const address = [
    payload.primary_address_street,
    payload.primary_address_city,
    payload.primary_address_country,
  ]
    .filter(Boolean)
    .join(', ');

  const cliente: SaciCliente = {
    identificationType: payload.contact_type ?? 'CI',
    identification: payload.identification ?? payload.id,
    socialReason: fullName,
    email: payload.email1,
    phone: payload.phone_mobile ?? payload.phone_work,
    address: address || undefined,
  };

  return { endpoint: '/clientes', method: 'POST', payload: cliente };
}
