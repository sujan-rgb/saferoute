import { pool, withTx } from '../config/db.js';
import { clearLocation, logEvent, missedCheckIn } from '../services/safeWalkService.js';

// Ends Safe Walks that hit their time limit and clears their location.
export async function expireWalks() {
  const [due] = await pool.execute("SELECT id FROM safe_walk_sessions WHERE status = 'active' AND expires_at <= NOW()");
  for (const { id } of due) {
    await withTx(async (conn) => {
      const [r] = await conn.execute(`UPDATE safe_walk_sessions SET status = 'expired', ended_at = NOW(), ${clearLocation} WHERE id = ? AND status = 'active'`, [id]);
      if (r.affectedRows) await logEvent(conn, id, 'expired', 'Sharing time limit reached. Location sharing stopped.');
    });
  }
}

// Real version of the prototype's "Simulate missed check-in": notify contacts once when a check-in is overdue.
export async function detectMissedCheckIns() {
  const [due] = await pool.execute(
    "SELECT id FROM safe_walk_sessions WHERE status = 'active' AND next_checkin_due_at <= NOW() AND missed_notified_at IS NULL");
  for (const { id } of due) await missedCheckIn(id);
}

// Retention. These windows are placeholders: set them from your written retention policy.
export async function purge() {
  await pool.execute("DELETE FROM notification_outbox WHERE status <> 'queued' AND created_at < NOW() - INTERVAL 7 DAY");
  await pool.execute("DELETE FROM safe_walk_sessions WHERE status <> 'active' AND ended_at < NOW() - INTERVAL 30 DAY");
  await pool.execute("DELETE FROM sos_events WHERE status = 'resolved' AND ended_at < NOW() - INTERVAL 30 DAY");
  await pool.execute('DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL 7 DAY');
}
