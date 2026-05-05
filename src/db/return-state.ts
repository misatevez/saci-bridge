import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getLocalPool } from './local.js';

export async function getLastPollTime(module: string): Promise<Date | null> {
  try {
    const pool = getLocalPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT last_poll_at FROM saci_return_state WHERE module = ?',
      [module],
    );
    if (rows.length === 0) return null;
    const val = rows[0]!['last_poll_at'];
    return val instanceof Date ? val : new Date(val as string);
  } catch {
    return null;
  }
}

export async function setLastPollTime(module: string, timestamp: Date): Promise<void> {
  try {
    const pool = getLocalPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO saci_return_state (module, last_poll_at, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_poll_at = VALUES(last_poll_at), updated_at = NOW()`,
      [module, timestamp],
    );
  } catch {
    // Non-fatal: worst case we re-process already-seen invoices (upsert handles idempotency)
  }
}
