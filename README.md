# SafeRoute: full-stack version of the prototype

Node 20.6+ / Express 5 / MySQL 8 API in `server/`, React + Vite client in `web/`.

## Run it
```bash
docker compose -f server/docker-compose.yml up -d        # MySQL 8.4 in UTC
cd server && cp .env.example .env                        # set JWT_SECRET (32+ chars)
npm install && npm run migrate && npm run seed:demo      # schema + prototype sample data + demo users
npm run dev                                              # API on :3000
npm run worker                                           # second terminal: delivery, expiry, missed check-ins, retention
cd ../web && npm install && npm run dev                  # client on :5173 (proxies /api)
```
Demo logins: `student@example.com` and `moderator@example.com` (password printed once by the seed script).
Tests: `cd server && npm test` replays the prototype's own scoring code against the new module.

## Before real use
1. **Notifications**: `server/src/services/notifier.js` is a stub. In production it fails on purpose, so alerts show as `failed` rather than looking sent. Wire up an SMS/email provider.
2. **Coordinates**: `002_seed_campus.sql` maps the prototype's SVG sample points around a placeholder anchor (lat 20, lng 78). Replace with surveyed campus data.
3. **Retention windows** in `workers/sweeper.js` (7/30 days) are placeholders for your written policy.
4. Package versions were not installed or run in the build environment; run `npm install` and the flows end to end.
