import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../config/db.js';
import { HttpError } from '../middleware/errors.js';
import { cleanText } from '../utils/sanitize.js';

const router = Router();
const LIMIT = 3;   // prototype: 3 reports per hour

// Counts this user's reports in the last hour. Called inside a transaction that holds a lock on the user row,
// so two simultaneous submissions cannot both slip under the limit. Works across any number of app instances.
async function quota(conn, userId) {
  const [rows] = await conn.execute(
    `SELECT GREATEST(1, TIMESTAMPDIFF(SECOND, NOW(), created_at + INTERVAL 1 HOUR)) AS retry
       FROM reports WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR ORDER BY created_at DESC LIMIT 3`, [userId]);
  const remaining = Math.max(0, LIMIT - rows.length);
  return { limit: LIMIT, remaining, retryAfterSec: remaining === 0 ? rows[LIMIT - 1].retry : 0 };
}

const createSchema = z.object({
  category: z.enum(['broken_light', 'unsafe_path', 'harassment_concern', 'hazard']),
  routeId: z.number().int().positive(),
  description: z.string().max(1000).transform(cleanText).pipe(z.string().min(3, 'Add a short description first.').max(140)),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'lat and lng go together' });

router.post('/', async (req, res) => {
  const b = createSchema.parse(req.body ?? {});
  const out = await withTx(async (conn) => {
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const qt = await quota(conn, req.user.id);
    if (qt.remaining === 0) throw new HttpError(429, 'report_limit', { limit: LIMIT, retryAfterSec: qt.retryAfterSec });
    const [route] = await conn.execute('SELECT id FROM routes WHERE id = ? AND is_active = 1', [b.routeId]);
    if (!route.length) throw new HttpError(404, 'route_not_found');
    const [ins] = await conn.execute(
      'INSERT INTO reports (user_id, route_id, category, description, lat, lng) VALUES (?,?,?,?,?,?)',
      [req.user.id, b.routeId, b.category, b.description, b.lat ?? null, b.lng ?? null]);
    return { id: ins.insertId, remaining: qt.remaining - 1 };
  });
  res.status(201).json({ id: out.id, status: 'pending', limit: LIMIT, remaining: out.remaining });
});

router.get('/quota', async (req, res) => {
  const conn = await pool.getConnection();
  try { res.json(await quota(conn, req.user.id)); } finally { conn.release(); }
});

router.get('/mine', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT r.id, r.category, r.description, r.status, r.created_at AS createdAt, rt.area_name AS areaName
       FROM reports r JOIN routes rt ON rt.id = r.route_id WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 50`, [req.user.id]);
  res.json(rows);
});

export default router;
