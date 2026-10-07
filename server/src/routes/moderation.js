import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { HttpError } from '../middleware/errors.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('moderator', 'admin'));

// Reporter identity is deliberately not returned to moderators (prototype: "Reporter identities are never shown").
router.get('/reports', async (req, res) => {
  const status = z.enum(['pending', 'verified', 'rejected', 'all']).default('all').parse(req.query.status);
  const [rows] = await pool.execute(
    `SELECT r.id, r.category, r.description, r.status, r.created_at AS createdAt, r.resolved_at AS resolvedAt, rt.area_name AS areaName
       FROM reports r JOIN routes rt ON rt.id = r.route_id
      WHERE (? = 'all' OR r.status = ?) ORDER BY r.created_at DESC LIMIT 200`, [status, status]);
  res.json(rows);
});

router.patch('/reports/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const b = z.object({ status: z.enum(['verified', 'rejected']), note: z.string().max(255).optional() }).parse(req.body ?? {});
  const [r] = await pool.execute(
    `UPDATE reports SET status = ?, moderated_by = ?, moderated_at = NOW(), moderation_note = ? WHERE id = ? AND status = 'pending'`,
    [b.status, req.user.id, b.note ?? null, id]);
  if (!r.affectedRows) throw new HttpError(409, 'not_pending_or_missing');
  res.json({ id, status: b.status });
});

// Facilities fixed the issue: the report stops lowering the route score.
router.post('/reports/:id/resolve', async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const [r] = await pool.execute("UPDATE reports SET resolved_at = NOW() WHERE id = ? AND status = 'verified' AND resolved_at IS NULL", [id]);
  if (!r.affectedRows) throw new HttpError(409, 'not_verified_or_already_resolved');
  res.json({ id, resolved: true });
});

export default router;
