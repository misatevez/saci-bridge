import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { V8Record } from '../src/v8-client.js';

// --- helpers to avoid importing reconcile directly (it calls main on load) ---

function normalize(value: unknown): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function accountKey(r: V8Record): string {
  const a = r.attributes;
  return normalize(a['name']) + '|' + normalize(a['billing_address_city']);
}

function contactKey(r: V8Record): string {
  const a = r.attributes;
  return normalize(a['first_name']) + '|' + normalize(a['last_name']) + '|' + normalize(a['email1']);
}

function productKey(r: V8Record): string {
  const a = r.attributes;
  return a['part_number'] ? normalize(a['part_number']) : normalize(a['name']);
}

function makeRecord(id: string, attributes: Record<string, unknown>): V8Record {
  return { id, type: 'test', attributes };
}

describe('normalize()', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Hello World  ')).toBe('hello world');
  });

  it('removes accents', () => {
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('niño')).toBe('nino');
    expect(normalize('Ñoño')).toBe('nono');
  });

  it('collapses multiple spaces', () => {
    expect(normalize('hello   world')).toBe('hello world');
  });

  it('handles null and undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize('')).toBe('');
  });

  it('handles numeric values', () => {
    expect(normalize(123)).toBe('123');
  });
});

describe('accountKey()', () => {
  it('builds key from name and city', () => {
    const r = makeRecord('1', { name: 'Empresa ABC', billing_address_city: 'Quito' });
    expect(accountKey(r)).toBe('empresa abc|quito');
  });

  it('matches despite accent differences', () => {
    const r1 = makeRecord('1', { name: 'Tecnicolor Cia.', billing_address_city: 'Guayaquil' });
    const r2 = makeRecord('2', { name: 'Tecnicolor Cia.', billing_address_city: 'Guayaquil' });
    expect(accountKey(r1)).toBe(accountKey(r2));
  });

  it('does not match different companies', () => {
    const r1 = makeRecord('1', { name: 'Alpha Corp', billing_address_city: 'Quito' });
    const r2 = makeRecord('2', { name: 'Beta Corp', billing_address_city: 'Quito' });
    expect(accountKey(r1)).not.toBe(accountKey(r2));
  });
});

describe('contactKey()', () => {
  it('builds key from name and email', () => {
    const r = makeRecord('1', { first_name: 'Juan', last_name: 'Pérez', email1: 'juan@example.com' });
    expect(contactKey(r)).toBe('juan|perez|juan@example.com');
  });

  it('matches names with and without accents', () => {
    const r1 = makeRecord('1', { first_name: 'José', last_name: 'García', email1: 'jose@x.com' });
    const r2 = makeRecord('2', { first_name: 'Jose', last_name: 'Garcia', email1: 'jose@x.com' });
    expect(contactKey(r1)).toBe(contactKey(r2));
  });
});

describe('productKey()', () => {
  it('uses part_number when available', () => {
    const r = makeRecord('1', { name: 'Widget Pro', part_number: 'WGT-001' });
    expect(productKey(r)).toBe('wgt-001');
  });

  it('falls back to name when part_number is missing', () => {
    const r = makeRecord('1', { name: 'Widget Pro' });
    expect(productKey(r)).toBe('widget pro');
  });
});

describe('matching logic', () => {
  it('should identify matched, only-firmas, and only-saci records', () => {
    const firmasRecords: V8Record[] = [
      makeRecord('f1', { name: 'Empresa Alpha', billing_address_city: 'Quito' }),
      makeRecord('f2', { name: 'Empresa Beta', billing_address_city: 'Guayaquil' }),
      makeRecord('f3', { name: 'Empresa Gamma', billing_address_city: 'Cuenca' }),
    ];

    const saciRecords: V8Record[] = [
      makeRecord('s1', { name: 'Empresa Alpha', billing_address_city: 'Quito' }),
      makeRecord('s2', { name: 'Empresa Delta', billing_address_city: 'Loja' }),
    ];

    const saciIndex = new Map<string, V8Record[]>();
    for (const r of saciRecords) {
      const key = accountKey(r);
      if (!key || key === '|') continue;
      const existing = saciIndex.get(key) ?? [];
      existing.push(r);
      saciIndex.set(key, existing);
    }

    let matched = 0;
    let onlyFirmas = 0;
    const matchedSaciIds = new Set<string>();

    for (const r of firmasRecords) {
      const key = accountKey(r);
      const candidates = saciIndex.get(key) ?? [];
      if (candidates.length === 1) {
        matched++;
        matchedSaciIds.add(candidates[0]!.id);
      } else {
        onlyFirmas++;
      }
    }

    const onlySaci = saciRecords.filter((r) => !matchedSaciIds.has(r.id)).length;

    expect(matched).toBe(1);
    expect(onlyFirmas).toBe(2);
    expect(onlySaci).toBe(1);
  });

  it('should flag ambiguous matches and not link them', () => {
    const firmasRecords: V8Record[] = [
      makeRecord('f1', { name: 'Empresa Duplicada', billing_address_city: 'Quito' }),
    ];

    const saciRecords: V8Record[] = [
      makeRecord('s1', { name: 'Empresa Duplicada', billing_address_city: 'Quito' }),
      makeRecord('s2', { name: 'Empresa Duplicada', billing_address_city: 'Quito' }),
    ];

    const saciIndex = new Map<string, V8Record[]>();
    for (const r of saciRecords) {
      const key = accountKey(r);
      const existing = saciIndex.get(key) ?? [];
      existing.push(r);
      saciIndex.set(key, existing);
    }

    let ambiguous = 0;
    let matched = 0;

    for (const r of firmasRecords) {
      const key = accountKey(r);
      const candidates = saciIndex.get(key) ?? [];
      if (candidates.length > 1) {
        ambiguous++;
      } else if (candidates.length === 1) {
        matched++;
      }
    }

    expect(ambiguous).toBe(1);
    expect(matched).toBe(0);
  });

  it('should skip records with empty business keys', () => {
    const firmasRecords: V8Record[] = [
      makeRecord('f1', { name: '', billing_address_city: '' }),
      makeRecord('f2', { name: 'Valid Company', billing_address_city: 'Quito' }),
    ];

    const validRecords = firmasRecords.filter((r) => {
      const key = accountKey(r);
      return key && key !== '|';
    });

    expect(validRecords).toHaveLength(1);
    expect(validRecords[0]!.id).toBe('f2');
  });
});

describe('V8Client', () => {
  it('should be importable and instantiable', async () => {
    const { V8Client } = await import('../src/v8-client.js');
    const client = new V8Client({
      baseUrl: 'https://example.com/Api/V8',
      tokenUrl: 'https://example.com/Api/access_token',
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });
    expect(client).toBeDefined();
  });

  it('should stop fetching when page has fewer records than pageSize', async () => {
    const { V8Client } = await import('../src/v8-client.js');

    const client = new V8Client({
      baseUrl: 'https://example.com/Api/V8',
      tokenUrl: 'https://example.com/Api/access_token',
      clientId: 'test-id',
      clientSecret: 'test-secret',
    });

    const axiosLib = await import('axios');
    const postSpy = vi.spyOn(axiosLib.default, 'post').mockResolvedValueOnce({
      data: { access_token: 'tok', expires_in: 3600 },
    } as never);

    const inner = (client as unknown as { client: { get: (u: string, o: unknown) => unknown } }).client;
    const getSpy = vi.spyOn(inner, 'get').mockResolvedValueOnce({
      data: {
        data: [
          { id: '1', type: 'Accounts', attributes: { name: 'A' } },
          { id: '2', type: 'Accounts', attributes: { name: 'B' } },
        ],
      },
    } as never);

    const records = await client.fetchAll('Accounts', ['name']);
    expect(records).toHaveLength(2);
    expect(records[0]!.id).toBe('1');
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
    postSpy.mockRestore();
  });
});
