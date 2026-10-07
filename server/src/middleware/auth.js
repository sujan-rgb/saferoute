import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './errors.js';

export function requireAuth(req, _res, next) {
  const token = req.cookies?.access_token;        // httpOnly, Secure, SameSite=Strict
  if (!token) throw new HttpError(401, 'unauthenticated');
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: Number(p.sub), role: p.role };
    next();
  } catch {
    throw new HttpError(401, 'invalid_token');
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) throw new HttpError(403, 'forbidden');
  next();
};

// Defence in depth on top of SameSite=Strict: state-changing requests must carry a custom header,
// which a cross-site form cannot send and a cross-origin script cannot send without CORS approval.
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'saferoute') throw new HttpError(403, 'csrf_check_failed');
  next();
}
