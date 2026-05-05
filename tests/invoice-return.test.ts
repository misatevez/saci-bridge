import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB modules before importing the module under test
// ---------------------------------------------------------------------------

const mockGetFirmasId = vi.fn<(module: string, saciId: string) => Promise<string | null>>();
const mockUpsertMapping = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetLastPollTime = vi.fn<() => Promise<Date | null>>().mockResolvedValue(null);
const mockSetLastPollTime = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

vi.mock('../src/db/id-mapping.js', () => ({
  getFirmasId: mockGetFirmasId,
  upsertMapping: mockUpsertMapping,
}));

vi.mock('../src/db/return-state.js', () => ({
  getLastPollTime: mockGetLastPollTime,
  setLastPollTime: mockSetLastPollTime,
}));

vi.mock('../src/auth.js', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
  invalidateToken: vi.fn(),
}));

// Mock the firmas DB pool
const mockExecute = vi.fn<() => Promise<[unknown[], unknown]>>().mockResolvedValue([[], {}]);
vi.mock('../src/db/firmas.js', () => ({
  getFirmasPool: () => ({ execute: mockExecute }),
}));

// Mock axios to avoid real HTTP calls
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    default: {
      ...actual.default,
      create: () => ({
        get: mockAxiosGet,
      }),
    },
    isAxiosError: actual.isAxiosError,
  };
});

const mockAxiosGet = vi.fn<() => Promise<unknown>>();

// Now import the module under test (after mocks are registered)
const { pollInvoices } = await import('../src/return-poller/invoice-return.js');

// ---------------------------------------------------------------------------

const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: 'saci-inv-001',
  type: 'AOS_Invoices',
  attributes: {
    name: 'INV-2026-001',
    invoice_num: '2026-001',
    billing_account_id: 'saci-acc-001',
    aos_quotes_id: 'saci-quote-001',
    total_amount: '1500.00',
    status: 'Unpaid',
    date_due: '2026-06-01',
    date_modified: '2026-05-05T00:00:00',
    date_entered: '2026-05-01T00:00:00',
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLastPollTime.mockResolvedValue(null);
  mockSetLastPollTime.mockResolvedValue(undefined);
  mockUpsertMapping.mockResolvedValue(undefined);
  mockExecute.mockResolvedValue([[], {}]);
  mockAxiosGet.mockResolvedValue({ data: { data: [] } });
});

describe('pollInvoices — no invoices', () => {
  it('updates last_poll_at even when there are no invoices', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [] } });

    await pollInvoices();

    expect(mockSetLastPollTime).toHaveBeenCalledOnce();
  });
});

describe('pollInvoices — create new invoice', () => {
  it('creates invoice and stores mapping when no existing firmas record', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [makeInvoice()] } });
    mockGetFirmasId
      .mockResolvedValueOnce(null)        // AOS_Invoices lookup → not found
      .mockResolvedValueOnce('firmas-acc-001')  // Accounts lookup
      .mockResolvedValueOnce('firmas-quote-001'); // AOS_Quotes lookup

    await pollInvoices();

    // Should INSERT into AOS_Invoices
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO AOS_Invoices'),
      expect.arrayContaining(['firmas-acc-001', 'firmas-quote-001', 1500]),
    );

    // Should store mapping
    expect(mockUpsertMapping).toHaveBeenCalledWith(
      'AOS_Invoices',
      expect.any(String),
      'saci-inv-001',
    );

    // Should update poll timestamp
    expect(mockSetLastPollTime).toHaveBeenCalledOnce();
  });

  it('creates invoice without account link when account mapping missing', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [makeInvoice()] } });
    mockGetFirmasId
      .mockResolvedValueOnce(null)   // AOS_Invoices → not found
      .mockResolvedValueOnce(null)   // Accounts → not found
      .mockResolvedValueOnce(null);  // AOS_Quotes → not found

    await pollInvoices();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO AOS_Invoices'),
      expect.arrayContaining([null, null]),
    );
    expect(mockUpsertMapping).toHaveBeenCalledOnce();
  });

  it('creates invoice without quote link when quote mapping missing', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [makeInvoice()] } });
    mockGetFirmasId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('firmas-acc-001')
      .mockResolvedValueOnce(null);  // quote not found

    await pollInvoices();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO AOS_Invoices'),
      expect.arrayContaining(['firmas-acc-001', null]),
    );
  });
});

describe('pollInvoices — update existing invoice', () => {
  it('updates status and total_amount when invoice already exists', async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        data: [makeInvoice({ status: 'Paid', total_amount: '2000.00' })],
      },
    });
    mockGetFirmasId.mockResolvedValueOnce('firmas-inv-existing');

    await pollInvoices();

    // Should UPDATE, not INSERT
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE AOS_Invoices'),
      expect.arrayContaining(['Paid', 2000, 2000, 'firmas-inv-existing']),
    );

    // Should NOT store a new mapping (record already exists)
    expect(mockUpsertMapping).not.toHaveBeenCalled();
  });
});

describe('pollInvoices — error resilience', () => {
  it('continues processing other invoices when one fails', async () => {
    const inv1 = makeInvoice({ id: 'saci-inv-001' } as Record<string, unknown>);
    const inv2 = { ...makeInvoice(), id: 'saci-inv-002' };

    mockAxiosGet.mockResolvedValue({ data: { data: [inv1, inv2] } });

    mockGetFirmasId
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('DB error')) // second invoice fails
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockExecute
      .mockResolvedValueOnce([[], {}])  // first INSERT succeeds
      .mockRejectedValueOnce(new Error('DB write error')); // this won't be reached since getFirmasId fails

    // Should not throw — errors are swallowed per-invoice
    await expect(pollInvoices()).resolves.not.toThrow();

    // poll timestamp should still be updated
    expect(mockSetLastPollTime).toHaveBeenCalledOnce();
  });

  it('handles SaciERP fetch failure gracefully', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Network error'));

    await expect(pollInvoices()).resolves.not.toThrow();

    // poll timestamp should NOT be updated on fetch failure
    expect(mockSetLastPollTime).not.toHaveBeenCalled();
  });
});

describe('toDecimal edge cases', () => {
  it('creates invoice with zero total when total_amount is undefined', async () => {
    const inv = makeInvoice();
    delete (inv.attributes as Record<string, unknown>)['total_amount'];

    mockAxiosGet.mockResolvedValue({ data: { data: [inv] } });
    mockGetFirmasId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await pollInvoices();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO AOS_Invoices'),
      expect.arrayContaining([0, 0]),
    );
  });
});
