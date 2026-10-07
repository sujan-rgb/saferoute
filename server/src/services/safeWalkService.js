import { withTx } from '../config/db.js';
import { env } from '../config/env.js';
import { enqueue } from './notify.js';

export const logEvent = (conn, sessionId, type, message) =>
  conn.execute('INSERT INTO safe_walk_events (session_id, event_type, message) VALUES (?,?,?)', [sessionId, type, message]);

export const clearLocation = `last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL, last_seen_at = NULL`;

export async function sessionContacts(conn, sessionId) {
  const [rows] = await conn.execute(
    `SELECT t.id, t.name, t.phone_e164, t.email FROM safe_walk_contacts c JOIN trusted_contacts t ON t.id = c.contact_id WHERE c.session_id = ?`, [sessionId]);
  return rows;
}

export async function missedCheckIn(sessionId) {
  return withTx(async (conn) => {
    const [found] = await conn.execute(
      `SELECT s.id, u.display_name FROM safe_walk_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.status = 'active' FOR UPDATE`, [sessionId]);
    const s = found[0];
    if (!s) return false;
    await conn.execute('UPDATE safe_walk_sessions SET missed_notified_at = NOW() WHERE id = ?', [sessionId]);
    await logEvent(conn, sessionId, 'missed_check_in', 'Missed check-in. Contacts asked to call you; SOS suggested.');
    await enqueue(conn, 'safe_walk_missed', await sessionContacts(conn, sessionId),
      `${s.display_name} missed a check-in during a Safe Walk. Please try calling them. Use the live-location link sent when the walk started.`);
    return true;
  });
}

export const checkinDueSql = `NOW() + INTERVAL ${Number(env.CHECKIN_INTERVAL_MIN)} MINUTE`;   // integer from validated config
