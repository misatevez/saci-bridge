import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool: mysql.Pool | null = null;

export function getLocalPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      timezone: '+00:00',
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function closeLocalPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
