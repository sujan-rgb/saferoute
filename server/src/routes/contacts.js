import { Router } from 'express';
import { z } from 'zod';
import { pool, withTx } from '../config/db.js';
import { HttpError } from '../middleware/errors.js';
import { enqueue } from '../services/notify.js';
import { sha256, sixDigitCode } from '../utils/tokens.js';

const router = Router();
const MAX_CONTACTS = 10;
const idParam = (req) => z.coerce.number().int().positive().parse(req.params.id);
const mask = (p) => (p ? `${p.slice(0, 3)}${'•'.repeat(Math.max(0, p.length - 5))}${p.slice(-2)}` : null);
const view = (c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: mask(c.phone_e164), email: c.email,
  defaultSelected: !!c.default_selected, verified: !!c.verified_at });

router.get('/', async (req, res) => {
  const [rows] = await pool.execute('SELECT id, name, relationship, phone_e164, email, default_selected, verified_at FROM trusted_contacts WHERE user_id = ? ORDER BY id', [req.user.id]);
  res.json(rows.map(view));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relationship: z.string().trim().max(50).optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210').optional(),
  email: z.string().email().max(255).optional(),
  defaultSelected: z.boolean().default(false),
}).refine((b) => b.phone || b.email, { message: 'Provide a phone number or an email' });

// The contact must consent: they receive a 6-digit code that the user types back in to verify them.
router.post('/', async (req, res) => {
  const b = createSchema.parse(req.body ?? {});
  const code = sixDigitCode();
  const out = await withTx(async (conn) => {
    const [[{ n }]] = await conn.execute('SELECT COUNT(*) AS n FROM trusted_contacts WHERE user_id = ?', [req.user.id]);
    if (n >= MAX_CONTACTS) throw new HttpError(422, 'too_many_contacts');
    let ins;
    try {
      [ins] = await conn.execute(
        `INSERT INTO trusted_contacts (user_id, name, relationship, phone_e164, email, default_selected, verify_code_hash, verify_expires_at)
         VALUES (?,?,?,?,?,?,?, NOW() + INTERVAL 15 MINUTE)`,
        [req.user.id, b.name, b.relationship ?? null, b.phone ?? null, b.email ?? null, b.defaultSelected ? 1 : 0, sha256(code)]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'contact_exists');
      throw e;
    }
    const [[u]] = await conn.execute('SELECT display_name FROM users WHERE id = ?', [req.user.id]);
    await enqueue(conn, 'contact_verify', [{ id: ins.insertId, phone_e164: b.phone, email: b.email }],
      `${u.display_name} added you as a SafeRoute trusted contact. Your confirmation code is ${code}. Only share it with them if you agree.`);
    return ins.insertId;
  });
  res.status(201).json({ id: out, verified: false });
});

router.post('/:id/verify', async (req, res) => {
  const id = idParam(req);
  const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body ?? {});
  await withTx(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT verify_code_hash, verify_attempts, verify_expires_at > NOW() AS live, verified_at
         FROM trusted_contacts WHERE id = ? AND user_id = ? FOR UPDATE`, [id, req.user.id]);
    const c = rows[0];
    if (!c) throw new HttpError(404, 'contact_not_found');
    if (c.verified_at) return;
    if (!c.live || c.verify_attempts >= 5 || !c.verify_code_hash) throw new HttpError(422, 'code_expired_or_locked');
    if (c.verify_code_hash !== sha256(code)) {
      await conn.execute('UPDATE trusted_contacts SET verify_attempts = verify_attempts + 1 WHERE id = ?', [id]);
      await conn.commit();                                          // persist the failed attempt before rejecting
      throw new HttpError(422, 'wrong_code');
    }
    await conn.execute('UPDATE trusted_contacts SET verified_at = NOW(), verify_code_hash = NULL, verify_expires_at = NULL WHERE id = ?', [id]);
  });
  res.json({ id, verified: true });
});

router.patch('/:id', async (req, res) => {
  const id = idParam(req);
  const b = z.object({ defaultSelected: z.boolean() }).parse(req.body ?? {});
  const [r] = await pool.execute('UPDATE trusted_contacts SET default_selected = ? WHERE id = ? AND user_id = ?', [b.defaultSelected ? 1 : 0, id, req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'contact_not_found');
  res.json({ id, defaultSelected: b.defaultSelected });
});

router.delete('/:id', async (req, res) => {
  const [r] = await pool.execute('DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?', [idParam(req), req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'contact_not_found');
  res.status(204).end();
});

export default router;
