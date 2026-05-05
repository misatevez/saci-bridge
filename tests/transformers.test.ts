import { describe, it, expect } from 'vitest';
import { transformAccount } from '../src/transformers/account.js';
import { transformContact } from '../src/transformers/contact.js';
import { transformQuote } from '../src/transformers/quote.js';
import { transformProduct } from '../src/transformers/product.js';
import { transform } from '../src/transformers/index.js';
import type { SaciCliente, SaciPedido } from '../src/transformers/types.js';

describe('transformAccount', () => {
  it('maps account fields to SaciCliente', () => {
    const result = transformAccount({
      id: 'acc-001',
      name: 'Acme Corp',
      billing_address_street: 'Av. Principal 123',
      billing_address_city: 'Quito',
      billing_address_country: 'Ecuador',
      email1: 'info@acme.com',
      phone_office: '+593999000001',
      account_type: 'RUC',
      sic_code: '1791234567001',
    });

    expect(result.endpoint).toBe('/clientes');
    expect(result.method).toBe('POST');

    const payload = result.payload as SaciCliente;
    expect(payload.identificationType).toBe('RUC');
    expect(payload.identification).toBe('1791234567001');
    expect(payload.socialReason).toBe('Acme Corp');
    expect(payload.email).toBe('info@acme.com');
    expect(payload.phone).toBe('+593999000001');
    expect(payload.address).toBe('Av. Principal 123, Quito, Ecuador');
  });

  it('falls back to id when sic_code missing', () => {
    const result = transformAccount({ id: 'acc-999', name: 'No Code' });
    const payload = result.payload as SaciCliente;
    expect(payload.identification).toBe('acc-999');
  });

  it('generates PATCH when saciId is provided', () => {
    const result = transformAccount({ id: 'acc-001', name: 'Acme Corp' }, 'saci-uuid-123');
    expect(result.method).toBe('PATCH');
    expect(result.endpoint).toBe('/clientes/saci-uuid-123');
  });

  it('generates POST when saciId is null', () => {
    const result = transformAccount({ id: 'acc-001', name: 'Acme Corp' }, null);
    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/clientes');
  });
});

describe('transformContact', () => {
  it('maps contact fields to SaciCliente', () => {
    const result = transformContact({
      id: 'ctr-001',
      first_name: 'Juan',
      last_name: 'Pérez',
      email1: 'juan@example.com',
      phone_mobile: '+593987654321',
      contact_type: 'CI',
      identification: '1712345678',
    });

    const payload = result.payload as SaciCliente;
    expect(payload.socialReason).toBe('Juan Pérez');
    expect(payload.identificationType).toBe('CI');
    expect(payload.identification).toBe('1712345678');
    expect(payload.email).toBe('juan@example.com');
  });

  it('uses phone_work when phone_mobile missing', () => {
    const result = transformContact({ id: 'c1', last_name: 'Smith', phone_work: '02-2222222' });
    const payload = result.payload as SaciCliente;
    expect(payload.phone).toBe('02-2222222');
  });

  it('generates PATCH when saciId is provided', () => {
    const result = transformContact(
      { id: 'ctr-001', last_name: 'Pérez'},
      'saci-contact-uuid-123',
    );
    expect(result.method).toBe('PATCH');
    expect(result.endpoint).toBe('/clientes/saci-contact-uuid-123');
  });

  it('generates POST when saciId is null', () => {
    const result = transformContact({ id: 'ctr-001', last_name: 'Pérez'},null);
    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/clientes');
  });

  it('generates POST by default when saciId is undefined', () => {
    const result = transformContact({ id: 'ctr-001', last_name: 'Pérez'});
    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/clientes');
  });
});

describe('transformQuote', () => {
  it('maps quote to SaciPedido with details as array', () => {
    const result = transformQuote({
      id: 'q-001',
      quote_num: 'QT-0042',
      date_quote_expected_closed: '2026-05-01',
      billing_account_name: 'Acme Corp',
      billing_address_street: 'Av. Principal 123',
      billing_address_city: 'Quito',
      billing_contact_email: 'info@acme.com',
      billing_contact_phone: '+593999000001',
      identification_type: 'RUC',
      identification: '1791234567001',
      line_items: [
        { name: 'Widget A', quantity: 2, unit_price: 50, sku: 'WGT-A', total_amount: 100 },
        { name: 'Widget B', quantity: 1, unit_price: 200, sku: 'WGT-B' },
      ],
    });

    expect(result.endpoint).toBe('/pedidos');
    const payload = result.payload as SaciPedido;
    expect(payload.idDoc).toBe('QT-0042');
    expect(payload.emissionDate).toBe('2026-05-01');
    expect(payload.socialReason).toBe('Acme Corp');
    expect(Array.isArray(payload.details)).toBe(true);
    expect(payload.details).toHaveLength(2);
    expect(payload.details[0]).toEqual({
      sku: 'WGT-A',
      nombre: 'Widget A',
      cantidad: 2,
      precioUnitario: 50,
      total: 100,
    });
    expect(payload.details[1]).toEqual({
      sku: 'WGT-B',
      nombre: 'Widget B',
      cantidad: 1,
      precioUnitario: 200,
      total: 200,
    });
  });

  it('handles missing line_items gracefully', () => {
    const result = transformQuote({ id: 'q-empty', billing_account_name: 'X' });
    const payload = result.payload as SaciPedido;
    expect(payload.details).toEqual([]);
  });
});

describe('transformProduct', () => {
  it('maps product fields to SaciProducto', () => {
    const result = transformProduct({
      id: 'prod-001',
      name: 'Impresora Laser',
      sku_saci_c: 'IMP-001',
      price: 350.99,
      quantity: 10,
      category: '002',
      status: 'Active',
    });

    expect(result.endpoint).toBe('/productos');
    const payload = result.payload as { sku: string; nombre: string; estado: boolean };
    expect(payload.sku).toBe('IMP-001');
    expect(payload.nombre).toBe('Impresora Laser');
    expect(payload.estado).toBe(true);
  });

  it('marks inactive products', () => {
    const result = transformProduct({ id: 'p2', name: 'Old Item', status: 'Inactive' });
    const payload = result.payload as { estado: boolean };
    expect(payload.estado).toBe(false);
  });

  it('generates PATCH when saciId is provided', () => {
    const result = transformProduct({ id: 'prod-001', name: 'Widget' }, 'saci-prod-999');
    expect(result.method).toBe('PATCH');
    expect(result.endpoint).toBe('/productos/saci-prod-999');
  });

  it('generates POST when saciId is null', () => {
    const result = transformProduct({ id: 'prod-001', name: 'Widget' }, null);
    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/productos');
  });

  it('falls back to part_number when sku_saci_c missing', () => {
    const result = transformProduct({ id: 'prod-002', name: 'Widget', part_number: 'PN-42' });
    const payload = result.payload as { sku: string };
    expect(payload.sku).toBe('PN-42');
  });

  it('falls back to id when both sku_saci_c and part_number missing', () => {
    const result = transformProduct({ id: 'prod-003', name: 'Widget' });
    const payload = result.payload as { sku: string };
    expect(payload.sku).toBe('prod-003');
  });

  it('uses category_id over category', () => {
    const result = transformProduct({ id: 'p', name: 'P', category: '001', category_id: '005' });
    const payload = result.payload as { categoria: string };
    expect(payload.categoria).toBe('005');
  });
});

describe('transform registry', () => {
  it('dispatches Accounts to transformAccount', () => {
    const json = JSON.stringify({ id: 'x', name: 'Test' });
    const result = transform('Accounts', json);
    expect(result.endpoint).toBe('/clientes');
  });

  it('dispatches Contacts to transformContact', () => {
    const json = JSON.stringify({ id: 'x', last_name: 'Test' });
    const result = transform('Contacts', json);
    expect(result.endpoint).toBe('/clientes');
  });

  it('dispatches AOS_Quotes to transformQuote', () => {
    const json = JSON.stringify({ id: 'x' });
    const result = transform('AOS_Quotes', json);
    expect(result.endpoint).toBe('/pedidos');
  });

  it('dispatches AOS_Products to transformProduct (POST when no saciId)', () => {
    const json = JSON.stringify({ id: 'x', name: 'P' });
    const result = transform('AOS_Products', json);
    expect(result.endpoint).toBe('/productos');
    expect(result.method).toBe('POST');
  });

  it('dispatches AOS_Products to transformProduct (PATCH when saciId provided)', () => {
    const json = JSON.stringify({ id: 'x', name: 'P' });
    const result = transform('AOS_Products', json, 'saci-123');
    expect(result.endpoint).toBe('/productos/saci-123');
    expect(result.method).toBe('PATCH');
  });
});
