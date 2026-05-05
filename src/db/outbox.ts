import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getFirmasPool } from './firmas.js';

export type OutboxStatus = 'pending' | 'in_flight' | 'sent' | 'failed' | 'skipped';

export type OutboxModule = 'Accounts' | 'Contacts' | 'AOS_Products' | 'AOS_Quotes' | 'AOS_Invoices';

export interface OutboxRow {
  id: string;
  module: OutboxModule;
  record_id: string;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: Date | null;
  sent_at: Date | null;
  created_at: Date;
}

export async function fetchPendingRows(batchSize: number): Promise<OutboxRow[]> {
  const pool = getFirmasPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, module, record_id, payload, status, attempts,
            next_attempt_at, sent_at, created_at
     FROM saci_outbox
     WHERE status = 'pending'
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     ORDER BY created_at ASC
     LIMIT ?`,
    [batchSize],
  );
  return rows as OutboxRow[];
}

export async function markInFlight(id: string): Promise<void> {
  const pool = getFirmasPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE saci_outbox SET status = 'in_flight', updated_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function markSent(id: string): Promise<void> {
  const pool = getFirmasPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE saci_outbox SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function markFailed(id: string): Promise<void> {
  const pool = getFirmasPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE saci_outbox SET status = 'failed', updated_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function markSkipped(id: string): Promise<void> {
  const pool = getFirmasPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE saci_outbox SET status = 'skipped', updated_at = NOW() WHERE id = ?`,
    [id],
  );
}

export async function incrementRetry(
  id: string,
  retryCount: number,
  nextRetryAt: Date,
): Promise<void> {
  const pool = getFirmasPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE saci_outbox
     SET status = 'pending', attempts = ?, next_attempt_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [retryCount, nextRetryAt, id],
  );
}
