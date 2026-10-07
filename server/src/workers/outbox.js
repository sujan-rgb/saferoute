import { withTx } from '../config/db.js';
import { env } from '../config/env.js';
import { send } from '../services/notifier.js';

const BATCH = 20;          // constant, interpolated into SQL below
const MAX_ATTEMPTS = 5;

// Claims queued rows with SKIP LOCKED so several workers can run side by side without double-sending.
export async function drainOutbox() {
  return withTx(async (conn) => {
    const [rows] = await conn.query(
      `SELECT o.id, o.channel, o.recipient_type, o.body, o.attempts, t.phone_e164, t.email
         FROM notification_outbox o LEFT JOIN trusted_contacts t ON t.id = o.contact_id
        WHERE o.status = 'queued' ORDER BY o.id LIMIT ${BATCH} FOR UPDATE OF o SKIP LOCKED`);
    for (const o of rows) {
      const to = o.recipient_type === 'campus_security'
        ? (o.channel === 'sms' ? env.CAMPUS_SECURITY_PHONE : env.CAMPUS_SECURITY_EMAIL)
        : (o.channel === 'sms' ? o.phone_e164 : o.email);
      try {
        await send({ channel: o.channel, to, body: o.body });
        await conn.execute("UPDATE notification_outbox SET status = 'sent', sent_at = NOW(), body = NULL WHERE id = ?", [o.id]);
      } catch (err) {
        const final = o.attempts + 1 >= MAX_ATTEMPTS;
        await conn.execute(
          'UPDATE notification_outbox SET status = ?, attempts = attempts + 1, last_error = ?, body = IF(?, NULL, body) WHERE id = ?',
          [final ? 'failed' : 'queued', String(err.message).slice(0, 255), final ? 1 : 0, o.id]);
      }
    }
    return rows.length;
  });
}
