import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { pool, withTx } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';
import { enqueue } from '../services/notify.js';
import { logEvent, sessionContacts, clearLocation, checkinDueSql, missedCheckIn } from '../services/safeWalkService.js';
import { haversine, progressAlong } from '../utils/geo.js';
import { newToken, sha256 } from '../utils/tokens.js';

const router = Router();
const idParam = (req) => z.coerce.number().int().positive().parse(req.params.id);
const pingLimiter = rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (req) => `walk:${req.user.id}`, standardHeaders: 'draft-7', legacyHeaders: false });
const REACHED_M = 40;   // within 40 m of the destination counts as "reached"

const startSchema = z.object({
  routeId: z.number().int().positive(),
  contactIds: z.array(z.number().int().positive()).min(1, 'Pick at least one trusted contact first.').max(10),
  durationMin: z.union([z.literal(30), z.literal(60), z.literal(90)]),   // the prototype's three choices
});

router.post('/', async (req, res) => {
  const b = startSchema.parse(req.body ?? {});
  const token = newToken();
  try {
    const out = await withTx(async (conn) => {
      const [contacts] = await conn.query(
        'SELECT id, name, phone_e164, email FROM trusted_contacts WHERE user_id = ? AND verified_at IS NOT NULL AND id IN (?)', [req.user.id, b.contactIds]);
      if (contacts.length !== new Set(b.contactIds).size) throw new HttpError(422, 'invalid_or_unverified_contacts');
      const [routes] = await conn.execute('SELECT id, label FROM routes WHERE id = ? AND is_active = 1', [b.routeId]);
      if (!routes.length) throw new HttpError(404, 'route_not_found');

      // query() (client-side escaping) rather than execute(): INTERVAL placeholders are unreliable in prepared statements
      const [ins] = await conn.query(
        `INSERT INTO safe_walk_sessions (user_id, route_id, duration_min, share_token_hash, expires_at, next_checkin_due_at)
         VALUES (?,?,?,?, NOW() + INTERVAL ? MINUTE, ${checkinDueSql})`, [req.user.id, b.routeId, b.durationMin, sha256(token), b.durationMin]);
      await conn.query('INSERT INTO safe_walk_contacts (session_id, contact_id) VALUES ?', [contacts.map((c) => [ins.insertId, c.id])]);
      await logEvent(conn, ins.insertId, 'started',
        `Sharing live location with ${contacts.map((c) => c.name).join(', ')} on the ${routes[0].label} route. Auto-stops in ${b.durationMin} min.`);
      const [[u]] = await conn.execute('SELECT display_name FROM users WHERE id = ?', [req.user.id]);
      await enqueue(conn, 'safe_walk_started', contacts,
        `${u.display_name} started a Safe Walk and is sharing their live location with you for up to ${b.durationMin} minutes: ${env.WEB_ORIGIN}/s/${token}`);
      return ins.insertId;
    });
    res.status(201).json({ id: out, durationMin: b.durationMin });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'walk_already_active');
    throw e;
  }
});

router.get('/active', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.id, s.route_id, s.duration_min, s.expires_at, s.last_lat, s.last_lng, s.destination_reached_at, r.label AS route_label
       FROM safe_walk_sessions s JOIN routes r ON r.id = s.route_id WHERE s.user_id = ? AND s.status = 'active' AND s.expires_at > NOW()`, [req.user.id]);
  const s = rows[0];
  if (!s) {
    const [last] = await pool.execute('SELECT id FROM safe_walk_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.user.id]);
    return res.json({ session: null, lastSessionId: last[0]?.id ?? null });
  }
  let progress = null;
  if (s.last_lat != null) {
    const [wps] = await pool.execute('SELECT n.lat, n.lng FROM route_waypoints w JOIN map_nodes n ON n.id = w.node_id WHERE w.route_id = ? ORDER BY w.seq', [s.route_id]);
    progress = Math.round(progressAlong(wps, { lat: s.last_lat, lng: s.last_lng }) * 100) / 100;
  }
  const [cs] = await pool.execute('SELECT contact_id FROM safe_walk_contacts WHERE session_id = ?', [s.id]);
  res.json({ session: { id: s.id, routeId: s.route_id, routeLabel: s.route_label, durationMin: s.duration_min, expiresAt: s.expires_at,
    destinationReached: !!s.destination_reached_at, progress, contactIds: cs.map((c) => c.contact_id) }, lastSessionId: s.id });
});

router.post('/:id/position', pingLimiter, async (req, res) => {
  const id = idParam(req);
  const b = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().int().min(0).max(65535).optional() }).parse(req.body ?? {});
  const [r] = await pool.execute(
    `UPDATE safe_walk_sessions SET last_lat = ?, last_lng = ?, last_accuracy_m = ?, last_seen_at = NOW()
      WHERE id = ? AND user_id = ? AND status = 'active' AND expires_at > NOW()`, [b.lat, b.lng, b.accuracyM ?? null, id, req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'no_active_walk');

  const [d] = await pool.execute(
    `SELECT s.destination_reached_at, n.lat, n.lng FROM safe_walk_sessions s
       JOIN routes r ON r.id = s.route_id JOIN map_nodes n ON n.id = r.destination_node_id WHERE s.id = ?`, [id]);
  if (d[0] && !d[0].destination_reached_at && haversine(b, d[0]) <= REACHED_M) {
    await withTx(async (conn) => {
      const [u] = await conn.execute('UPDATE safe_walk_sessions SET destination_reached_at = NOW() WHERE id = ? AND destination_reached_at IS NULL', [id]);
      if (u.affectedRows) await logEvent(conn, id, 'destination_reached', 'Reached destination. Waiting for you to confirm arrival.');
    });
  }
  res.status(204).end();
});

async function ownActive(conn, id, userId) {
  const [rows] = await conn.execute("SELECT id FROM safe_walk_sessions WHERE id = ? AND user_id = ? AND status = 'active' FOR UPDATE", [id, userId]);
  if (!rows.length) throw new HttpError(404, 'no_active_walk');
}

router.post('/:id/check-in', async (req, res) => {
  const id = idParam(req);
  await withTx(async (conn) => {
    await ownActive(conn, id, req.user.id);
    await conn.query(`UPDATE safe_walk_sessions SET last_checkin_at = NOW(), next_checkin_due_at = ${checkinDueSql}, missed_notified_at = NULL WHERE id = ?`, [id]);
    await logEvent(conn, id, 'check_in', 'You checked in: all good.');
  });
  res.status(204).end();
});

router.post('/:id/arrive', async (req, res) => {
  const id = idParam(req);
  await withTx(async (conn) => {
    await ownActive(conn, id, req.user.id);
    await conn.execute(`UPDATE safe_walk_sessions SET status = 'arrived', ended_at = NOW(), ${clearLocation} WHERE id = ?`, [id]);
    await logEvent(conn, id, 'arrived', 'Arrived safely. Contacts notified and sharing stopped.');
    const [[u]] = await conn.execute('SELECT display_name FROM users WHERE id = ?', [req.user.id]);
    await enqueue(conn, 'safe_walk_arrived', await sessionContacts(conn, id), `${u.display_name} arrived safely. Location sharing has stopped.`);
  });
  res.status(204).end();
});

router.post('/:id/stop', async (req, res) => {
  const id = idParam(req);
  await withTx(async (conn) => {
    await ownActive(conn, id, req.user.id);
    await conn.execute(`UPDATE safe_walk_sessions SET status = 'stopped', ended_at = NOW(), ${clearLocation} WHERE id = ?`, [id]);
    await logEvent(conn, id, 'stopped', 'You stopped sharing. Location is no longer visible.');
  });
  res.status(204).end();
});

// Demo parity with the prototype's "Simulate missed check-in" button. Real misses are detected by the worker.
if (env.NODE_ENV !== 'production') {
  router.post('/:id/simulate-missed', async (req, res) => {
    const id = idParam(req);
    const [own] = await pool.execute("SELECT id FROM safe_walk_sessions WHERE id = ? AND user_id = ? AND status = 'active'", [id, req.user.id]);
    if (!own.length) throw new HttpError(404, 'no_active_walk');
    await missedCheckIn(id);
    res.status(204).end();
  });
}

router.get('/:id/events', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT e.event_type AS type, e.message, e.created_at AS at FROM safe_walk_events e
       JOIN safe_walk_sessions s ON s.id = e.session_id WHERE s.id = ? AND s.user_id = ? ORDER BY e.id DESC LIMIT 100`, [idParam(req), req.user.id]);
  res.json(rows);
});

export default router;
