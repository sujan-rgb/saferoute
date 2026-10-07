import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, withTx } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { newToken, sha256 } from '../utils/tokens.js';

const router = Router();
const cookie = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict' };
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

async function startSession(res, user, conn = pool) {
  const refresh = newToken();
  await conn.execute('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?, NOW() + INTERVAL 30 DAY)', [user.id, sha256(refresh)]);
  const access = jwt.sign({ role: user.role }, env.JWT_SECRET, { subject: String(user.id), expiresIn: '15m', algorithm: 'HS256' });
  res.cookie('access_token', access, { ...cookie, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refresh, { ...cookie, path: '/api/auth', maxAge: 30 * 86_400_000 });
}
const publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role });

router.post('/register', authLimiter, async (req, res) => {
  const b = z.object({ email: z.string().email().max(255).toLowerCase(), password: z.string().min(12).max(128), displayName: z.string().trim().min(1).max(100) }).parse(req.body ?? {});
  const hash = await argon2.hash(b.password);                        // argon2id by default
  let id;
  try {
    [{ insertId: id }] = await pool.execute('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)', [b.email, hash, b.displayName]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'email_taken');
    throw e;
  }
  const user = { id, email: b.email, display_name: b.displayName, role: 'user' };
  await startSession(res, user);
  res.status(201).json(publicUser(user));
});

router.post('/login', authLimiter, async (req, res) => {
  const b = z.object({ email: z.string().email().toLowerCase(), password: z.string().max(128) }).parse(req.body ?? {});
  const [rows] = await pool.execute('SELECT id, email, password_hash, display_name, role, is_active FROM users WHERE email = ?', [b.email]);
  const u = rows[0];
  if (!u || !u.is_active || !(await argon2.verify(u.password_hash, b.password))) throw new HttpError(401, 'invalid_credentials');
  await startSession(res, u);
  res.json(publicUser(u));
});

// Rotating refresh tokens. Presenting an already-used token revokes every session for that user (theft signal).
router.post('/refresh', async (req, res) => {
  const t = req.cookies?.refresh_token;
  if (!t) throw new HttpError(401, 'no_refresh_token');
  const user = await withTx(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT r.id, r.user_id, r.revoked_at, r.expires_at > NOW() AS live, u.id AS uid, u.email, u.display_name, u.role, u.is_active
         FROM refresh_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? FOR UPDATE`, [sha256(t)]);
    const r = rows[0];
    if (!r) return null;
    if (r.revoked_at) { await conn.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [r.user_id]); return null; }
    if (!r.live || !r.is_active) return null;
    await conn.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [r.id]);
    return { id: r.uid, email: r.email, display_name: r.display_name, role: r.role };
  });
  if (!user) throw new HttpError(401, 'invalid_refresh_token');
  await startSession(res, user);
  res.json(publicUser(user));
});

router.post('/logout', async (req, res) => {
  const t = req.cookies?.refresh_token;
  if (t) await pool.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [sha256(t)]);
  res.clearCookie('access_token', cookie).clearCookie('refresh_token', { ...cookie, path: '/api/auth' });
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await pool.execute('SELECT id, email, display_name, role FROM users WHERE id = ? AND is_active = 1', [req.user.id]);
  if (!rows[0]) throw new HttpError(401, 'unauthenticated');
  res.json(publicUser(rows[0]));
});

export default router;
