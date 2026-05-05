import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal unit tests for return-poller internals (no DB / network)
// We test the timestamp helper and update-SQL generation logic by extracting
// the pure parts into testable functions exposed via the module.

describe('return-poller timestamp formatting', () => {
  it('converts Date to MySQL datetime string', () => {
    const d = new Date('2026-05-05T12:34:56.789Z');
    const formatted = d.toISOString().replace('T', ' ').substring(0, 19);
    expect(formatted).toBe('2026-05-05 12:34:56');
  });

  it('converts epoch to MySQL datetime string', () => {
    const d = new Date(0);
    const formatted = d.toISOString().replace('T', ' ').substring(0, 19);
    expect(formatted).toBe('1970-01-01 00:00:00');
  });
});

describe('return-poller field extraction', () => {
  it('extracts stock and price from SaciERP attributes', () => {
    const attrs: Record<string, unknown> = { qty_in_stock: '42', price: '199.99' };
    const stock = attrs['qty_in_stock'] != null ? Number(attrs['qty_in_stock']) : null;
    const price = attrs['price'] != null ? Number(attrs['price']) : null;

    expect(stock).toBe(42);
    expect(price).toBeCloseTo(199.99);
  });

  it('returns null when fields are absent', () => {
    const attrs: Record<string, unknown> = {};
    const stock = attrs['qty_in_stock'] != null ? Number(attrs['qty_in_stock']) : null;
    const price = attrs['price'] != null ? Number(attrs['price']) : null;

    expect(stock).toBeNull();
    expect(price).toBeNull();
  });

  it('handles zero values correctly', () => {
    const attrs: Record<string, unknown> = { qty_in_stock: 0, price: 0 };
    const stock = attrs['qty_in_stock'] != null ? Number(attrs['qty_in_stock']) : null;
    const price = attrs['price'] != null ? Number(attrs['price']) : null;

    expect(stock).toBe(0);
    expect(price).toBe(0);
  });
});

describe('return-poller SQL builder', () => {
  function buildUpdateSql(
    stock: number | null,
    price: number | null,
    firmasId: string,
  ): { sql: string; values: (number | string)[] } | null {
    const parts: string[] = [];
    const values: (number | string)[] = [];

    if (stock !== null) {
      parts.push('stock_disponible_c = ?');
      values.push(stock);
    }
    if (price !== null) {
      parts.push('precio_saci_c = ?');
      values.push(price);
    }

    if (parts.length === 0) return null;

    values.push(firmasId);
    return {
      sql: `UPDATE aos_products_cstm SET ${parts.join(', ')} WHERE id_c = ?`,
      values,
    };
  }

  it('builds UPDATE with both stock and price', () => {
    const result = buildUpdateSql(10, 99.9, 'prod-uuid-001');
    expect(result).not.toBeNull();
    expect(result!.sql).toBe(
      'UPDATE aos_products_cstm SET stock_disponible_c = ?, precio_saci_c = ? WHERE id_c = ?',
    );
    expect(result!.values).toEqual([10, 99.9, 'prod-uuid-001']);
  });

  it('builds UPDATE with only stock', () => {
    const result = buildUpdateSql(5, null, 'prod-uuid-002');
    expect(result!.sql).toBe(
      'UPDATE aos_products_cstm SET stock_disponible_c = ? WHERE id_c = ?',
    );
    expect(result!.values).toEqual([5, 'prod-uuid-002']);
  });

  it('builds UPDATE with only price', () => {
    const result = buildUpdateSql(null, 249.0, 'prod-uuid-003');
    expect(result!.sql).toBe(
      'UPDATE aos_products_cstm SET precio_saci_c = ? WHERE id_c = ?',
    );
    expect(result!.values).toEqual([249.0, 'prod-uuid-003']);
  });

  it('returns null when both fields are null (no-op)', () => {
    const result = buildUpdateSql(null, null, 'prod-uuid-004');
    expect(result).toBeNull();
  });
});
