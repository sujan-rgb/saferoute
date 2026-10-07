import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pino from 'pino-http';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { csrfGuard, requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import auth from './routes/auth.js';
import routes, { meta } from './routes/routes.js';
import reports from './routes/reports.js';
import moderation from './routes/moderation.js';
import insights from './routes/insights.js';
import contacts from './routes/contacts.js';
import safeWalk from './routes/safeWalk.js';
import sos from './routes/sos.js';
import shared from './routes/shared.js';

export const app = express();
app.set('trust proxy', 1);                           // behind one reverse proxy / load balancer
app.use(pino({ redact: ['req.headers.authorization', 'req.headers.cookie', 'req.params.token', 'req.url'] }));
app.use(helmet());                                    // CSP, HSTS, no-referrer, nosniff, ...
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/healthz', async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); });

app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', csrfGuard);

app.use('/api/auth', auth);                           // public (login, register, refresh)
app.use('/api/shared', shared);                       // public, token-only

app.use('/api', requireAuth);                         // everything below needs a signed-in user
app.use('/api/meta', meta);
app.use('/api/routes', routes);
app.use('/api/reports', reports);
app.use('/api/contacts', contacts);
app.use('/api/safe-walk', safeWalk);
app.use('/api/sos', sos);
app.use('/api/moderation', moderation);               // moderator / admin
app.use('/api/insights', insights);                   // moderator / admin

app.use(errorHandler);
