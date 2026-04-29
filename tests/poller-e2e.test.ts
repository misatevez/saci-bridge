/**
 * E2E poller test.
 *
 * Requires a running MariaDB at FIRMAS_DB_HOST:FIRMAS_DB_PORT with
 * `saci_outbox` seeded (see docker/init-firmas.sql).
 * Run with: docker-compose -f docker-compose.test.yml up -d
 *
 * This test is skipped in CI unless E2E_ENABLED=true.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { transformAccount } from '../src/transformers/account.js';
import type { SaciCliente } from '../src/transformers/types.js';

const E2E = process.env['E2E_ENABLED'] === 'true';

describe.skipIf(!E2E)('Poller E2E', () => {
  let pool: mysql.Pool;

  beforeAll(async () => {
    pool = mysql.createPool({
      host: process.env['FIRMAS_DB_HOST'] ?? '127.0.0.1',
      port: Number(process.env['FIRMAS_DB_PORT'] ?? 3307),
      user: process.env['FIRMAS_DB_USER'] ?? 'saci_bridge_reader',
      password: process.env['FIRMAS_DB_PASS'] ?? 'readerpass',
      database: process.env['FIRMAS_DB_NAME'] ?? 'firmascrm',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('can query saci_outbox pending rows', async () => {
    const [rows] = await pool.execute(
      "SELECT id, target_module, status FROM saci_outbox WHERE status = 'pending' LIMIT 5",
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it('E2E: transform Account row matches SaciCliente shape', async () => {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      "SELECT payload_json FROM saci_outbox WHERE id = 'e2e-account-001'",
    );
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    const payload = typeof row.payload_json === 'string'
      ? JSON.parse(row.payload_json)
      : row.payload_json;

    const result = transformAccount(payload);
    const cliente = result.payload as SaciCliente;

    expect(cliente.socialReason).toBe('Empresa Test');
    expect(cliente.identification).toBe('1791234560001');
    expect(result.endpoint).toBe('/clientes');
  });
});
