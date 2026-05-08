import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getLocalPool } from './local.js';

export interface IdMapping {
  crm_id: string;
  saci_id: string;
  entity_type: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Look up the SaciERP ID for a given firmas record.
 * Returns null if the record has never been synced.
 */
export async function getSaciId(module: string, firmasId: string): Promise<string | null> {
  try {
    const pool = getLocalPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT saci_id FROM saci_id_mapping WHERE entity_type = ? AND crm_id = ?',
      [module, firmasId],
    );
    return rows.length > 0 ? (rows[0]!['saci_id'] as string) : null;
  } catch {
    // Local DB might not be configured in all envs — fail open
    return null;
  }
}

/**
 * Look up the firmas record ID for a given SaciERP ID (reverse lookup for return-poller).
 * Returns null if no mapping exists.
 */
export async function getFirmasId(module: string, saciId: string): Promise<string | null> {
  try {
    const pool = getLocalPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT crm_id FROM saci_id_mapping WHERE entity_type = ? AND saci_id = ?',
      [module, saciId],
    );
    return rows.length > 0 ? (rows[0]!['crm_id'] as string) : null;
  } catch {
    return null;
  }
}

/**
 * Store or update the mapping between a firmas record ID and its SaciERP ID.
 */
export async function upsertMapping(module: string, firmasId: string, saciId: string): Promise<void> {
  try {
    const pool = getLocalPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO saci_id_mapping (entity_type, crm_id, saci_id, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE crm_id = VALUES(crm_id), entity_type = VALUES(entity_type), updated_at = NOW()`,
      [module, firmasId, saciId],
    );
  } catch (err) {
    // Log the error — silent failures here caused the duplicate-invoice bug
    const { logger } = await import('../logger.js');
    logger.error({ err, module, firmasId, saciId }, '[ID-MAPPING] upsertMapping failed');
  }
}
