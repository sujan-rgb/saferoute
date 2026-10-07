import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true,
});
await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const [done] = await conn.query('SELECT 1 FROM schema_migrations WHERE name = ?', [f]);
  if (done.length) continue;
  await conn.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
  console.log('applied', f);
}
await conn.end();
