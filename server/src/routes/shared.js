import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { HttpError } from '../middleware/errors.js';
import { sha256 } from '../utils/tokens.js';

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

// Public, token-only view for a trusted contact. Shows the minimum: first name, latest position, activity log.
// Unknown, ended and expired links all return the same 404.
router.get('/:token', async (req, res) => {
  const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(req.params);
  const hash = sha256(token);
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

  const [walks] = await pool.execute(
    `SELECT s.id, s.last_lat, s.last_lng, s.last_seen_at, s.expires_at, u.display_name, r.label AS route_label
       FROM safe_walk_sessions s JOIN users u ON u.id = s.user_id JOIN routes r ON r.id = s.route_id
      WHERE s.share_token_hash = ? AND s.status = 'active' AND s.expires_at > NOW()`, [hash]);
  if (walks[0]) {
    const w = walks[0];
    const [events] = await pool.execute('SELECT event_type AS type, message, created_at AS at FROM safe_walk_events WHERE session_id = ? ORDER BY id DESC LIMIT 50', [w.id]);
    return res.json({ kind: 'safe_walk', name: w.display_name.split(' ')[0], routeLabel: w.route_label, expiresAt: w.expires_at,
      location: w.last_lat == null ? null : { lat: w.last_lat, lng: w.last_lng, seenAt: w.last_seen_at }, events });
  }

  const [sos] = await pool.execute(
    `SELECT s.last_lat, s.last_lng, s.last_seen_at, s.triggered_at, u.display_name
       FROM sos_events s JOIN users u ON u.id = s.user_id WHERE s.share_token_hash = ? AND s.status = 'active'`, [hash]);
  if (sos[0]) {
    const s = sos[0];
    return res.json({ kind: 'sos', name: s.display_name.split(' ')[0], triggeredAt: s.triggered_at,
      location: s.last_lat == null ? null : { lat: s.last_lat, lng: s.last_lng, seenAt: s.last_seen_at }, events: [] });
  }
  throw new HttpError(404, 'not_found');
});

export default router;
