import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { pool, withTx } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';
import { enqueue, securityConfigured } from '../services/notify.js';
import { clearLocation } from '../services/safeWalkService.js';
import { newToken, sha256 } from '../utils/tokens.js';

const router = Router();
const idParam = (req) => z.coerce.number().int().positive().parse(req.params.id);
const limiter = rateLimit({ windowMs: 10 * 60_000, limit: 10, keyGenerator: (req) => `sos:${req.user.id}`, standardHeaders: 'draft-7', legacyHeaders: false });

const schema = z.object({
  idempotencyKey: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().int().min(0).max(65535).optional(),
  contactIds: z.array(z.number().int().positive()).max(10).optional(),   // omit to use the contacts marked default
}).refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: 'lat and lng go together' });

// Called only after the client-side 5-second countdown completes. The key makes retries on a flaky network safe.
router.post('/', limiter, async (req, res) => {
  const b = schema.parse(req.body ?? {});
  const token = newToken();
  try {
    const out = await withTx(async (conn) => {
      const [ins] = await conn.execute(
        `INSERT INTO sos_events (user_id, idempotency_key, share_token_hash, last_lat, last_lng, last_accuracy_m, last_seen_at)
         VALUES (?,?,?,?,?,?, IF(? IS NULL, NULL, NOW()))`,
        [req.user.id, b.idempotencyKey, sha256(token), b.lat ?? null, b.lng ?? null, b.accuracyM ?? null, b.lat ?? null]);

      const [contacts] = b.contactIds?.length
        ? await conn.query('SELECT id, phone_e164, email FROM trusted_contacts WHERE user_id = ? AND verified_at IS NOT NULL AND id IN (?)', [req.user.id, b.contactIds])
        : await conn.execute('SELECT id, phone_e164, email FROM trusted_contacts WHERE user_id = ? AND verified_at IS NOT NULL AND default_selected = 1', [req.user.id]);

      const security = (env.SOS_ALWAYS_NOTIFY_SECURITY || contacts.length === 0) && securityConfigured();
      if (!contacts.length && !security) throw new HttpError(503, 'no_recipients');   // fail loudly; the UI tells the user to call 112

      const [[u]] = await conn.execute('SELECT display_name FROM users WHERE id = ?', [req.user.id]);
      await enqueue(conn, 'sos', contacts,
        `SOS from ${u.display_name}: they need help. Live location: ${env.WEB_ORIGIN}/s/${token}  If you cannot reach them, call your local emergency number (112 in India).`, { security });
      return { sosId: ins.insertId, contacts: contacts.length, security };
    });
    res.status(202).json({ sosId: out.sosId, notifiedContacts: out.contacts, notifiedSecurity: out.security });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.execute('SELECT id FROM sos_events WHERE user_id = ? AND idempotency_key = ?', [req.user.id, b.idempotencyKey]);
      return res.status(200).json({ sosId: rows[0]?.id, alreadyTriggered: true });
    }
    throw e;
  }
});

router.get('/active', async (req, res) => {
  const [rows] = await pool.execute("SELECT id FROM sos_events WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [req.user.id]);
  res.json({ sosId: rows[0]?.id ?? null });
});

router.put('/:id/location', async (req, res) => {
  const b = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().int().min(0).max(65535).optional() }).parse(req.body ?? {});
  const [r] = await pool.execute(
    "UPDATE sos_events SET last_lat = ?, last_lng = ?, last_accuracy_m = ?, last_seen_at = NOW() WHERE id = ? AND user_id = ? AND status = 'active'",
    [b.lat, b.lng, b.accuracyM ?? null, idParam(req), req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'no_active_sos');
  res.status(204).end();
});

// "Stop sharing and end SOS"
router.post('/:id/resolve', async (req, res) => {
  const [r] = await pool.execute(
    `UPDATE sos_events SET status = 'resolved', ended_at = NOW(), ${clearLocation} WHERE id = ? AND user_id = ? AND status = 'active'`, [idParam(req), req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'no_active_sos');
  res.status(204).end();
});

export default router;
