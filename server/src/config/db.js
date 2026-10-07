import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: env.DB_POOL_SIZE,   // keep (instances x limit) below MySQL max_connections
  maxIdle: env.DB_POOL_SIZE, idleTimeout: 60_000, queueLimit: 0,
  enableKeepAlive: true,
  charset: 'utf8mb4', timezone: 'Z',
  decimalNumbers: true,                // DECIMAL columns (lat, lng, weights) arrive as numbers, not strings
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
});

export async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
