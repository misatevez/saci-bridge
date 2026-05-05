import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getFirmasPool } from './firmas.js';

export type OutboxStatus = 'pending' | 'in_flight' | 'sent' | 'failed' | 'skipped';

export type OutboxModule = 'Accounts' | 'Contacts' | 'AOS_Products' | 'AOS_Quotes';

export interface OutboxRow {
  id: string;
  target_module: OutboxModule;
  record_id: string;
  payload_json: string;
  status: OutboxStatus;
  retry_count: number;
  next_retry_at: Date | null;
  sent_at: Date | null;
  created_at: Date;
}

export async function fetchPendingRows(batchSize: number): Promise<OutboxRow[]> {
  const pool = getFirmasPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, target_module, record_id, payload_json, status, retry_count,
            next_retry_at, sent_at, created_at
     FROM saci_outbox
     WHERE status = 'pending'
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
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
     SET status = 'pending', retry_count = ?, next_retry_at = ?, updated_at = NOW()
     WHERE id = ?`,
    [retryCount, nextRetryAt, id],
  );
}
