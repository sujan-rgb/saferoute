import { pool } from '../config/db.js';
import { drainOutbox } from './outbox.js';
import { expireWalks, detectMissedCheckIns, purge } from './sweeper.js';

const every = (ms, name, fn) => {
  let running = false;
  const tick = async () => {
    if (running) return;                                // never overlap runs of the same job
    running = true;
    try { await fn(); } catch (err) { console.error(`[worker:${name}]`, err.message); } finally { running = false; }
  };
  tick();
  return setInterval(tick, ms);
};

const timers = [
  every(3_000, 'outbox', drainOutbox),
  every(30_000, 'walks', async () => { await expireWalks(); await detectMissedCheckIns(); }),
  every(3_600_000, 'purge', purge),
];
console.log('SafeRoute worker running');

process.on('SIGTERM', async () => { timers.forEach(clearInterval); await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { timers.forEach(clearInterval); await pool.end(); process.exit(0); });
