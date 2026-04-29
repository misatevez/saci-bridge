import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool: mysql.Pool | null = null;

export function getFirmasPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.firmasDb.host,
      port: config.firmasDb.port,
      user: config.firmasDb.user,
      password: config.firmasDb.password,
      database: config.firmasDb.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      timezone: '+00:00',
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function closeFirmasPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
