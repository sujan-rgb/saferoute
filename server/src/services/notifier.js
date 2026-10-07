import { env } from '../config/env.js';

const mask = (s) => (s ? `${s.slice(0, 3)}***${s.slice(-2)}` : '(none)');

// PROVIDER STUB: this is the one thing you must wire up before real use (Twilio / AWS SNS+SES / etc.).
// In production it throws on purpose, so undelivered alerts show up as 'failed' in the outbox instead of looking sent.
export async function send({ channel, to, body }) {
  if (!to) throw new Error('no destination');
  if (env.NODE_ENV !== 'production') {
    console.log(`[notify:dev] ${channel} -> ${mask(to)}: ${body}`);
    return;
  }
  throw new Error('No SMS/email provider configured in services/notifier.js');
}
