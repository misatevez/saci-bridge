import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformQuote } from '../src/transformers/quote.js';
import type { HandlerResult, HandlerDeps } from '../src/transformers/types.js';

type MockDeps = {
  [K in keyof HandlerDeps]: ReturnType<typeof vi.fn>;
};

function makeDeps(overrides: Partial<MockDeps> = {}): HandlerDeps {
  return {
    getSaciId: vi.fn().mockResolvedValue(null),
    upsertMapping: vi.fn().mockResolvedValue(undefined),
    callSaci: vi.fn().mockResolvedValue({ ok: true, status: 200, body: { data: { id: 'saci-new-id' } } }),
    queryFirmas: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as HandlerDeps;
}

describe('transformQuote — skip logic', () => {
  it('skips Draft approval_status', () => {
    const result = transformQuote({ id: 'q1', approval_status: 'Draft' });
    expect('skip' in result).toBe(true);
  });

  it('skips no approval_status', () => {
    const result = transformQuote({ id: 'q2' });
    expect('skip' in result).toBe(true);
  });

  it('skips Rejected approval_status', () => {
    const result = transformQuote({ id: 'q3', approval_status: 'Rejected' });
    expect('skip' in result).toBe(true);
  });

  it('does NOT skip Approved', () => {
    const result = transformQuote({ id: 'q4', approval_status: 'Approved' });
    expect('handle' in result).toBe(true);
  });

  it('does NOT skip Converted stage', () => {
    const result = transformQuote({ id: 'q5', stage: 'Converted' });
    expect('handle' in result).toBe(true);
  });

  it('does NOT skip delete event regardless of approval_status', () => {
    const result = transformQuote({ id: 'q6', event_type: 'delete' });
    expect('handle' in result).toBe(true);
  });
});

describe('transformQuote handler — header create', () => {
  it('POSTs AOS_Quotes header with correct attributes', async () => {
    const result = transformQuote({
      id: 'q-001',
      name: 'Test Quote',
      approval_status: 'Approved',
      stage: 'Negotiation',
      date_quote_expected_closed: '2026-06-01',
      subtotal_amount: 100,
      discount_amount: 10,
      tax_amount: 12,
      total_amount: 102,
      currency_id: 'USD',
      description: 'A test quote',
    }) as HandlerResult;

    const deps = makeDeps();
    await result.handle('outbox-1', deps);

    expect(deps.callSaci).toHaveBeenCalledWith(
      'outbox-1',
      'POST',
      '/module/AOS_Quotes',
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AOS_Quotes',
          attributes: expect.objectContaining({
            name: 'Test Quote',
            quote_stage: 'Negotiation',
            date_quote_expected_closed: '2026-06-01',
            subtotal_amount: 100,
            discount_amount: 10,
            tax_amount: 12,
            grand_total_amount: 102,
            currency_id: 'USD',
            description: 'A test quote',
          }),
        }),
      }),
    );
  });

  it('stores AOS_Quotes mapping after successful POST', async () => {
    const result = transformQuote({ id: 'q-001', approval_status: 'Approved' }) as HandlerResult;
    const deps = makeDeps({
      callSaci: vi.fn().mockResolvedValue({ ok: true, status: 201, body: { data: { id: 'saci-q-123' } } }),
    });

    await result.handle('outbox-1', deps);

    expect(deps.upsertMapping).toHaveBeenCalledWith('AOS_Quotes', 'q-001', 'saci-q-123');
  });

  it('returns ok:false when POST header fails', async () => {
    const result = transformQuote({ id: 'q-fail', approval_status: 'Approved' }) as HandlerResult;
    const deps = makeDeps({
      callSaci: vi.fn().mockResolvedValue({ ok: false, status: 500, body: 'error', retryable: false }),
    });

    const outcome = await result.handle('outbox-1', deps);

    expect(outcome.ok).toBe(false);
  });

  it('uses quote_num as fallback name', async () => {
    const result = transformQuote({
      id: 'q-002',
      quote_num: 'QT-2026-001',
      approval_status: 'Approved',
    }) as HandlerResult;

    const deps = makeDeps();
    await result.handle('outbox-1', deps);

    const call = (deps.callSaci as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].data.attributes.name).toBe('QT-2026-001');
  });
});

describe('transformQuote handler — header update (PATCH)', () => {
  it('PATCHes AOS_Quotes when saciId provided', async () => {
    const result = transformQuote({ id: 'q-003', approval_status: 'Approved' }, 'saci-q-existing') as HandlerResult;

    const deps = makeDeps();
    await result.handle('outbox-1', deps);

    expect(deps.callSaci).toHaveBeenCalledWith(
      'outbox-1',
      'PATCH',
      '/module/AOS_Quotes/saci-q-existing',
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AOS_Quotes',
          id: 'saci-q-existing',
        }),
      }),
    );
  });

  it('does NOT call upsertMapping on PATCH (mapping already exists)', async () => {
    const result = transformQuote({ id: 'q-003', approval_status: 'Approved' }, 'saci-q-existing') as HandlerResult;
    const deps = makeDeps();
    await result.handle('outbox-1', deps);

    const mappingCalls = (deps.upsertMapping as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'AOS_Quotes',
    );
    expect(mappingCalls).toHaveLength(0);
  });
});

describe('transformQuote handler — relationship resolution', () => {
  it('resolves billing_account_id to SaciERP ID and includes in attributes', async () => {
    const result = transformQuote({
      id: 'q-004',
      approval_status: 'Approved',
      billing_account_id: 'firmas-acc-001',
    }) as HandlerResult;

    const deps = makeDeps({
      getSaciId: vi.fn().mockImplementation((module: string, id: string) => {
        if (module === 'Accounts' && id === 'firmas-acc-001') return Promise.resolve('saci-acc-999');
        return Promise.resolve(null);
      }),
    });

    await result.handle('outbox-1', deps);

    const call = (deps.callSaci as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].data.attributes.billing_account_id).toBe('saci-acc-999');
  });

  it('resolves billing_contact_id to SaciERP ID and includes in attributes', async () => {
    const result = transformQuote({
      id: 'q-005',
      approval_status: 'Approved',
      billing_contact_id: 'firmas-con-001',
    }) as HandlerResult;

    const deps = makeDeps({
      getSaciId: vi.fn().mockImplementation((module: string, id: string) => {
        if (module === 'Contacts' && id === 'firmas-con-001') return Promise.resolve('saci-con-888');
        return Promise.resolve(null);
      }),
    });

    await result.handle('outbox-1', deps);

    const call = (deps.callSaci as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].data.attributes.billing_contact_id).toBe('saci-con-888');
  });

  it('creates quote without account link when billing_account_id has no mapping', async () => {
    const result = transformQuote({
      id: 'q-006',
      approval_status: 'Approved',
      billing_account_id: 'firmas-acc-unmapped',
    }) as HandlerResult;

    const deps = makeDeps({ getSaciId: vi.fn().mockResolvedValue(null) });
    const outcome = await result.handle('outbox-1', deps);

    expect(outcome.ok).toBe(true);
    const call = (deps.callSaci as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].data.attributes.billing_account_id).toBeUndefined();
  });
});

describe('transformQuote handler — line items', () => {
  it('syncs line items as AOS_Products_Quotes records', async () => {
    const result = transformQuote({ id: 'q-007', approval_status: 'Approved' }) as HandlerResult;

    const lineItems = [
      { id: 'li-1', name: 'Widget A', product_id: null, quantity: 2, unit_price: 50, total_amount: 100, currency_id: null },
      { id: 'li-2', name: 'Widget B', product_id: null, quantity: 1, unit_price: 200, total_amount: 200, currency_id: 'USD' },
    ];

    const callSaciMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, body: { data: { id: 'saci-q-200' } } }) // header POST
      .mockResolvedValue({ ok: true, status: 201, body: { data: { id: 'saci-li-new' } } });   // line item POSTs

    const deps = makeDeps({
      callSaci: callSaciMock,
      queryFirmas: vi.fn().mockResolvedValue(lineItems),
    });

    await result.handle('outbox-1', deps);

    const lineItemCalls = callSaciMock.mock.calls.filter(
      (c: unknown[]) => (c[2] as string).includes('AOS_Products_Quotes'),
    );
    expect(lineItemCalls).toHaveLength(2);

    const firstLineCall = lineItemCalls[0];
    expect(firstLineCall[1]).toBe('POST');
    expect(firstLineCall[2]).toBe('/module/AOS_Products_Quotes');
    expect(firstLineCall[3].data.attributes).toMatchObject({
      name: 'Widget A',
      quantity: 2,
      unit_price: 50,
      total_amount: 100,
      parent_type: 'AOS_Quotes',
      parent_id: 'saci-q-200',
    });
  });

  it('resolves product_id via id-mapping for line items', async () => {
    const result = transformQuote({ id: 'q-008', approval_status: 'Approved' }) as HandlerResult;

    const lineItems = [
      { id: 'li-3', name: 'Mapped Product', product_id: 'firmas-prod-001', quantity: 1, unit_price: 100, total_amount: 100, currency_id: null },
    ];

    const callSaciMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, body: { data: { id: 'saci-q-300' } } })
      .mockResolvedValue({ ok: true, status: 201, body: { data: { id: 'saci-li-300' } } });

    const getSaciIdMock = vi.fn().mockImplementation((module: string, id: string) => {
      if (module === 'AOS_Products' && id === 'firmas-prod-001') return Promise.resolve('saci-prod-777');
      return Promise.resolve(null);
    });

    const deps = makeDeps({
      callSaci: callSaciMock,
      queryFirmas: vi.fn().mockResolvedValue(lineItems),
      getSaciId: getSaciIdMock,
    });

    await result.handle('outbox-1', deps);

    const lineItemCall = callSaciMock.mock.calls.find(
      (c: unknown[]) => (c[2] as string).includes('AOS_Products_Quotes'),
    );
    expect(lineItemCall[3].data.attributes.product_id).toBe('saci-prod-777');
  });

  it('stores mapping for each created line item', async () => {
    const result = transformQuote({ id: 'q-009', approval_status: 'Approved' }) as HandlerResult;

    const lineItems = [
      { id: 'li-4', name: 'Item', product_id: null, quantity: 1, unit_price: 10, total_amount: 10, currency_id: null },
    ];

    const callSaciMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, body: { data: { id: 'saci-q-400' } } })
      .mockResolvedValue({ ok: true, status: 201, body: { data: { id: 'saci-li-400' } } });

    const deps = makeDeps({
      callSaci: callSaciMock,
      queryFirmas: vi.fn().mockResolvedValue(lineItems),
    });

    await result.handle('outbox-1', deps);

    expect(deps.upsertMapping).toHaveBeenCalledWith('AOS_Products_Quotes', 'li-4', 'saci-li-400');
  });

  it('syncs header only when line item query returns empty', async () => {
    const result = transformQuote({ id: 'q-010', approval_status: 'Approved' }) as HandlerResult;

    const callSaciMock = vi.fn()
      .mockResolvedValue({ ok: true, status: 201, body: { data: { id: 'saci-q-500' } } });

    const deps = makeDeps({
      callSaci: callSaciMock,
      queryFirmas: vi.fn().mockResolvedValue([]),
    });

    const outcome = await result.handle('outbox-1', deps);

    expect(outcome.ok).toBe(true);
    const lineItemCalls = callSaciMock.mock.calls.filter(
      (c: unknown[]) => (c[2] as string).includes('AOS_Products_Quotes'),
    );
    expect(lineItemCalls).toHaveLength(0);
  });

  it('skips a line item without failing the whole sync when line item POST fails', async () => {
    const result = transformQuote({ id: 'q-011', approval_status: 'Approved' }) as HandlerResult;

    const lineItems = [
      { id: 'li-fail', name: 'Bad Item', product_id: null, quantity: 1, unit_price: 10, total_amount: 10, currency_id: null },
    ];

    const callSaciMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201, body: { data: { id: 'saci-q-600' } } }) // header OK
      .mockResolvedValue({ ok: false, status: 400, body: 'bad request', retryable: false });   // line item fails

    const deps = makeDeps({
      callSaci: callSaciMock,
      queryFirmas: vi.fn().mockResolvedValue(lineItems),
    });

    const outcome = await result.handle('outbox-1', deps);

    // Header succeeded, whole sync returns ok even if line item fails
    expect(outcome.ok).toBe(true);
  });
});

describe('transformQuote handler — delete event', () => {
  it('soft-deletes AOS_Quotes header when event_type=delete', async () => {
    const result = transformQuote({ id: 'q-del-1', event_type: 'delete' }, 'saci-q-del-1') as HandlerResult;

    const deps = makeDeps();
    await result.handle('outbox-1', deps);

    expect(deps.callSaci).toHaveBeenCalledWith(
      'outbox-1',
      'PATCH',
      '/module/AOS_Quotes/saci-q-del-1',
      expect.objectContaining({
        data: expect.objectContaining({
          attributes: expect.objectContaining({ deleted: 1 }),
        }),
      }),
    );
  });

  it('returns ok:true when delete event but no saciId', async () => {
    const result = transformQuote({ id: 'q-no-saci', event_type: 'delete' }, null) as HandlerResult;

    const deps = makeDeps();
    const outcome = await result.handle('outbox-1', deps);

    expect(outcome.ok).toBe(true);
    expect(deps.callSaci).not.toHaveBeenCalled();
  });
});

describe('transformQuote handler — line item reconciliation on update', () => {
  it('soft-deletes existing line items before re-creating on update', async () => {
    const result = transformQuote(
      { id: 'q-upd', approval_status: 'Approved' },
      'saci-q-upd',
    ) as HandlerResult;

    const existingLineItemIds = [{ id: 'li-old-1' }, { id: 'li-old-2' }];

    const getSaciIdMock = vi.fn().mockImplementation((module: string, id: string) => {
      if (module === 'AOS_Products_Quotes' && id === 'li-old-1') return Promise.resolve('saci-li-old-1');
      if (module === 'AOS_Products_Quotes' && id === 'li-old-2') return Promise.resolve('saci-li-old-2');
      return Promise.resolve(null);
    });

    const callSaciMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: {} });

    const deps = makeDeps({
      getSaciId: getSaciIdMock,
      callSaci: callSaciMock,
      queryFirmas: vi.fn()
        .mockResolvedValueOnce(existingLineItemIds) // soft-delete lookup: all IDs
        .mockResolvedValueOnce([]),                 // sync: no new items
    });

    await result.handle('outbox-1', deps);

    const softDeleteCalls = callSaciMock.mock.calls.filter(
      (c: unknown[]) =>
        (c[2] as string).includes('AOS_Products_Quotes') && c[1] === 'PATCH',
    );
    expect(softDeleteCalls).toHaveLength(2);
    expect(softDeleteCalls[0][3].data.attributes.deleted).toBe(1);
    expect(softDeleteCalls[1][3].data.attributes.deleted).toBe(1);
  });
});
