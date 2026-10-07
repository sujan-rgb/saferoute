import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, code, extra = {}) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof HttpError) {
    if (err.extra.retryAfterSec) res.set('Retry-After', String(err.extra.retryAfterSec));
    return res.status(err.status).json({ error: err.code, ...err.extra });
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal_error' });
}
