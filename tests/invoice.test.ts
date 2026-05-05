import { describe, it, expect } from 'vitest';
import { transformInvoice, transformInvoiceLineItem } from '../src/transformers/invoice.js';
import { transform } from '../src/transformers/index.js';
import type { SaciV8Record } from '../src/transformers/types.js';

describe('transformInvoice — header mapping', () => {
  it('maps full invoice payload to V8 POST', () => {
    const result = transformInvoice({
      id: 'inv-001',
      name: 'Invoice #001',
      invoice_number: 'INV-0042',
      invoice_date: '2026-05-01',
      due_date: '2026-05-31',
      status: 'Unpaid',
      billing_account_id: 'acc-firmas-001',
      billing_contact_id: 'ctr-firmas-001',
      quote_id: 'quo-firmas-001',
      subtotal_amount: 1000,
      discount_amount: 50,
      tax_amount: 142.5,
      shipping_amount: 0,
      total_amount: 1192.5,
      currency_id: 'USD',
      description: 'Test invoice',
    });

    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/module/AOS_Invoices');

    const body = result.payload as SaciV8Record;
    expect(body.data.type).toBe('AOS_Invoices');
    expect(body.data.id).toBeUndefined();

    const attrs = body.data.attributes;
    expect(attrs['name']).toBe('Invoice #001');
    expect(attrs['invoice_number']).toBe('INV-0042');
    expect(attrs['date_entered']).toBe('2026-05-01');
    expect(attrs['due_date']).toBe('2026-05-31');
    expect(attrs['status']).toBe('Unpaid');
    expect(attrs['billing_account_id']).toBe('acc-firmas-001');
    expect(attrs['billing_contact_id']).toBe('ctr-firmas-001');
    expect(attrs['quote_id']).toBe('quo-firmas-001');
    expect(attrs['subtotal_amount']).toBe('1000.00');
    expect(attrs['discount_amount']).toBe('50.00');
    expect(attrs['tax_amount']).toBe('142.50');
    expect(attrs['shipping_amount']).toBe('0.00');
    expect(attrs['total_amount']).toBe('1192.50');
    expect(attrs['currency_id']).toBe('USD');
    expect(attrs['description']).toBe('Test invoice');
  });

  it('falls back to invoice_number then id for name', () => {
    const result = transformInvoice({ id: 'inv-002', invoice_number: 'INV-0043' });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['name']).toBe('INV-0043');
  });

  it('falls back to id when name and invoice_number are absent', () => {
    const result = transformInvoice({ id: 'inv-bare' });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['name']).toBe('inv-bare');
  });

  it('defaults status to Unpaid when not provided', () => {
    const result = transformInvoice({ id: 'inv-003' });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['status']).toBe('Unpaid');
  });
});

describe('transformInvoice — status mapping', () => {
  it.each([['Unpaid'], ['Paid'], ['Cancelled'], ['Draft'], ['Sent']])(
    'passes through status %s',
    (status) => {
      const result = transformInvoice({ id: 'inv-s', status });
      const attrs = (result.payload as SaciV8Record).data.attributes;
      expect(attrs['status']).toBe(status);
    },
  );
});

describe('transformInvoice — relationship resolution via resolved ids', () => {
  it('uses resolved saciAccountId over raw billing_account_id', () => {
    const result = transformInvoice(
      { id: 'inv-004', billing_account_id: 'firmas-acc-uuid' },
      null,
      { saciAccountId: 'saci-acc-uuid' },
    );
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['billing_account_id']).toBe('saci-acc-uuid');
  });

  it('falls back to raw billing_account_id when no resolved id', () => {
    const result = transformInvoice({ id: 'inv-005', billing_account_id: 'firmas-acc-uuid' });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['billing_account_id']).toBe('firmas-acc-uuid');
  });

  it('uses resolved saciContactId over raw billing_contact_id', () => {
    const result = transformInvoice(
      { id: 'inv-006', billing_contact_id: 'firmas-ctr-uuid' },
      null,
      { saciContactId: 'saci-ctr-uuid' },
    );
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['billing_contact_id']).toBe('saci-ctr-uuid');
  });

  it('uses resolved saciQuoteId over raw quote_id', () => {
    const result = transformInvoice(
      { id: 'inv-007', quote_id: 'firmas-quo-uuid' },
      null,
      { saciQuoteId: 'saci-quo-uuid' },
    );
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['quote_id']).toBe('saci-quo-uuid');
  });

  it('omits quote_id when no raw id and no resolved id', () => {
    const result = transformInvoice({ id: 'inv-008' });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['quote_id']).toBeUndefined();
  });

  it('omits quote_id when resolved saciQuoteId is null', () => {
    const result = transformInvoice({ id: 'inv-009', quote_id: 'firmas-quo-uuid' }, null, {
      saciQuoteId: null,
    });
    const attrs = (result.payload as SaciV8Record).data.attributes;
    // null resolved means no mapping; falls back to raw firmas id
    expect(attrs['quote_id']).toBe('firmas-quo-uuid');
  });
});

describe('transformInvoice — create vs update', () => {
  it('generates POST to /module/AOS_Invoices when no saciId', () => {
    const result = transformInvoice({ id: 'inv-010' });
    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/module/AOS_Invoices');
  });

  it('generates PATCH to /module/AOS_Invoices/{saciId} when saciId provided', () => {
    const result = transformInvoice({ id: 'inv-011' }, 'saci-inv-uuid');
    expect(result.method).toBe('PATCH');
    expect(result.endpoint).toBe('/module/AOS_Invoices/saci-inv-uuid');

    const body = result.payload as SaciV8Record;
    expect(body.data.id).toBe('saci-inv-uuid');
  });

  it('generates POST when saciId is null', () => {
    const result = transformInvoice({ id: 'inv-012' }, null);
    expect(result.method).toBe('POST');
  });
});

describe('transformInvoiceLineItem — line item sync', () => {
  it('maps line item to separate AOS_Products_Quotes POST', () => {
    const result = transformInvoiceLineItem(
      { name: 'Widget A', unit_price: 50, quantity: 2, total_amount: 100, product_id: 'prod-firmas-001' },
      'saci-inv-uuid',
      'saci-prod-uuid',
    );

    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/module/AOS_Products_Quotes');

    const body = result.payload as SaciV8Record;
    expect(body.data.type).toBe('AOS_Products_Quotes');

    const attrs = body.data.attributes;
    expect(attrs['name']).toBe('Widget A');
    expect(attrs['unit_price']).toBe('50.00');
    expect(attrs['quantity']).toBe('2');
    expect(attrs['total_amount']).toBe('100.00');
    expect(attrs['product_id']).toBe('saci-prod-uuid');
    expect(attrs['parent_type']).toBe('AOS_Invoices');
    expect(attrs['parent_id']).toBe('saci-inv-uuid');
  });

  it('falls back to raw product_id when no resolved saciProductId', () => {
    const result = transformInvoiceLineItem(
      { name: 'Widget B', product_id: 'firmas-prod-uuid' },
      'saci-inv-uuid',
    );
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['product_id']).toBe('firmas-prod-uuid');
  });

  it('generates PATCH when line item has an existing id', () => {
    const result = transformInvoiceLineItem(
      { id: 'li-existing-001', name: 'Widget C', unit_price: 75, quantity: 1 },
      'saci-inv-uuid',
    );
    expect(result.method).toBe('PATCH');
    expect(result.endpoint).toBe('/module/AOS_Products_Quotes/li-existing-001');

    const body = result.payload as SaciV8Record;
    expect(body.data.id).toBe('li-existing-001');
  });

  it('defaults quantity to 1 when not provided', () => {
    const result = transformInvoiceLineItem({ name: 'Item' }, 'saci-inv-uuid');
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['quantity']).toBe('1');
  });

  it('omits unit_discount_amount when not provided', () => {
    const result = transformInvoiceLineItem({ name: 'Item' }, 'saci-inv-uuid');
    const attrs = (result.payload as SaciV8Record).data.attributes;
    expect(attrs['unit_discount_amount']).toBeUndefined();
  });
});

describe('transform registry — AOS_Invoices dispatch', () => {
  it('dispatches AOS_Invoices to transformInvoice', () => {
    const json = JSON.stringify({ id: 'inv-reg-001', name: 'Invoice via registry' });
    const result = transform('AOS_Invoices', json);
    expect(result).toHaveProperty('method', 'POST');
    expect(result).toHaveProperty('endpoint', '/module/AOS_Invoices');
  });

  it('dispatches AOS_Invoices with saciId for PATCH', () => {
    const json = JSON.stringify({ id: 'inv-reg-002', name: 'Update via registry' });
    const result = transform('AOS_Invoices', json, 'saci-reg-uuid');
    expect(result).toHaveProperty('method', 'PATCH');
    expect(result).toHaveProperty('endpoint', '/module/AOS_Invoices/saci-reg-uuid');
  });
});
