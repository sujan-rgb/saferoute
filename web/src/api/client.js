export class ApiError extends Error {
  constructor(status, body) { super(body?.error || 'request_failed'); this.status = status; this.body = body; }
}

async function raw(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'saferoute' },   // required by the server's CSRF guard
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

// One transparent refresh-and-retry when the 15-minute access cookie has expired.
export async function api(method, path, body) {
  try {
    return await raw(method, path, body);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || NO_REFRESH.includes(path)) throw e;
    try { await raw('POST', '/auth/refresh', {}); } catch { throw e; }
    return raw(method, path, body);
  }
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b = {}) => api('PUT', p, b);
export const patch = (p, b = {}) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

const MESSAGES = {
  invalid_credentials: 'That email and password do not match.',
  email_taken: 'An account with that email already exists.',
  walk_already_active: 'You already have a Safe Walk running.',
  invalid_or_unverified_contacts: 'Only verified contacts can receive a Safe Walk.',
  wrong_code: 'That code is not right.',
  code_expired_or_locked: 'That code has expired or been locked. Add the contact again to get a new one.',
  contact_exists: 'You already added that contact.',
  too_many_contacts: 'You can have up to 10 trusted contacts.',
  no_recipients: 'No one could be alerted.',
};

export function friendlyError(e) {
  const b = e?.body;
  if (b?.error === 'validation_error') return b.issues?.[0]?.message ?? 'Check the form and try again.';
  if (b?.error === 'report_limit') return `Rate limit reached. Try again in about ${Math.max(1, Math.ceil((b.retryAfterSec ?? 3600) / 60))} minutes.`;
  return MESSAGES[b?.error] ?? 'Something went wrong. Try again.';
}
