import { env } from '../config/env.js';

// Writes outbox rows on the caller's connection so they commit atomically with the event that caused them.
// contacts: [{ id, phone_e164, email }]
export async function enqueue(conn, kind, contacts, body, { security = false } = {}) {
  const rows = [];
  for (const c of contacts) {
    if (c.phone_e164) rows.push([kind, 'contact', c.id, 'sms', body]);
    if (c.email && (!c.phone_e164 || kind === 'sos')) rows.push([kind, 'contact', c.id, 'email', body]);
  }
  if (security) {
    if (env.CAMPUS_SECURITY_PHONE) rows.push([kind, 'campus_security', null, 'sms', body]);
    if (env.CAMPUS_SECURITY_EMAIL) rows.push([kind, 'campus_security', null, 'email', body]);
  }
  if (rows.length) await conn.query('INSERT INTO notification_outbox (kind, recipient_type, contact_id, channel, body) VALUES ?', [rows]);
  return rows.length;
}

export const securityConfigured = () => Boolean(env.CAMPUS_SECURITY_PHONE || env.CAMPUS_SECURITY_EMAIL);
