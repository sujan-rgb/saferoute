// Creates demo accounts and the prototype's starting reports and contacts. Development only.
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { pool } from '../src/config/db.js';

const [exists] = await pool.execute("SELECT id FROM users WHERE email = 'student@example.com'");
if (exists.length) { console.log('Demo data already present.'); await pool.end(); process.exit(0); }

const password = process.env.DEMO_PASSWORD || randomBytes(9).toString('base64url');
const hash = await argon2.hash(password);
const [s] = await pool.execute("INSERT INTO users (email, password_hash, display_name, role) VALUES ('student@example.com', ?, 'Demo Student', 'user')", [hash]);
await pool.execute("INSERT INTO users (email, password_hash, display_name, role) VALUES ('moderator@example.com', ?, 'Demo Moderator', 'moderator')", [hash]);

// The prototype's Mom / Riya / Warden, pre-verified. Warden is not ticked by default, as in the prototype.
const contacts = [['Mom', 'Parent', 'mom@example.com', 1], ['Riya', 'Friend', 'riya@example.com', 1], ['Warden', 'Hostel warden', 'warden@example.com', 0]];
for (const [name, rel, email, sel] of contacts) {
  await pool.execute('INSERT INTO trusted_contacts (user_id, name, relationship, email, default_selected, verified_at) VALUES (?,?,?,?,?, NOW())', [s.insertId, name, rel, email, sel]);
}

// The prototype's two starting reports.
const route = async (code) => (await pool.execute("SELECT id FROM routes WHERE code = ? LIMIT 1", [code]))[0][0].id;
await pool.execute("INSERT INTO reports (user_id, route_id, category, description, status, moderated_at) VALUES (?,?,'broken_light','Two lamps out near Market lane','verified', NOW())", [s.insertId, await route('fastest')]);
await pool.execute("INSERT INTO reports (user_id, route_id, category, description) VALUES (?,?,'unsafe_path','Overgrown hedge blocks the view on Park road')", [s.insertId, await route('balanced')]);

console.log(`Demo users: student@example.com and moderator@example.com\nPassword (shown once): ${password}`);
await pool.end();
