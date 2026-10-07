import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError, get, post, put } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGeolocation } from '../hooks/useGeolocation.js';

export default function Sos() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState('idle');           // idle | counting | sending | sent | error
  const [key, setKey] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => get('/contacts') });
  const active = useQuery({ queryKey: ['sos-active'], queryFn: () => get('/sos/active') });
  const names = (contacts.data ?? []).filter((c) => c.verified && c.defaultSelected).map((c) => c.name);

  const sosId = result?.sosId ?? active.data?.sosId ?? null;
  const sent = phase === 'sent' || (phase === 'idle' && !!sosId);

  // Ask for location only once the person presses SOS (or while an alert is live).
  const { pos } = useGeolocation(phase === 'counting' || phase === 'sending' || sent);
  const posRef = useRef(null);
  posRef.current = pos;

  async function send(k) {
    setPhase('sending');
    try {
      const p = posRef.current;
      setResult(await post('/sos', { idempotencyKey: k, ...(p ? { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM } : {}) }));
      setPhase('sent');
    } catch (e) {
      setErr(friendlyError(e));
      setPhase('error');                               // retry reuses the same key, so it can never double-send
    }
  }

  const countdown = useCountdown(5, () => send(key));
  const press = () => { setKey(crypto.randomUUID()); setPhase('counting'); countdown.start(); };
  const cancel = () => { countdown.cancel(); setPhase('idle'); };

  useEffect(() => {                                    // keep the live location fresh while the alert is open
    if (!sent || !sosId) return undefined;
    const t = setInterval(() => { if (posRef.current) put(`/sos/${sosId}/location`, posRef.current).catch(() => {}); }, 10_000);
    return () => clearInterval(t);
  }, [sent, sosId]);

  async function end() {
    await post(`/sos/${sosId}/resolve`);
    setResult(null); setPhase('idle'); setKey(null);
    qc.invalidateQueries({ queryKey: ['sos-active'] });
  }

  const who = result
    ? [result.notifiedContacts ? 'Your contacts' : null, result.notifiedSecurity ? 'campus security' : null].filter(Boolean).join(' and ')
    : 'Your contacts and campus security';

  return (
    <div className="pn" style={{ maxWidth: 560, margin: 'auto', textAlign: 'center' }}>
      <h2>SOS support</h2>
      <p className="mu">Sends an alert and live location to your chosen contacts ({names.join(', ') || 'none selected'}).</p>

      {phase === 'idle' && !sent && (<><button className="sos" onClick={press}>SOS</button><p className="mu">A 5-second countdown lets you cancel accidental taps.</p></>)}

      {(phase === 'counting' || phase === 'sending') && (
        <>
          <button className="sos" disabled>{phase === 'sending' ? '…' : countdown.left}</button>
          <button className="btn o" onClick={cancel} disabled={phase === 'sending'}>Cancel alert</button>
        </>
      )}

      {phase === 'error' && (
        <div className="err" style={{ textAlign: 'left' }}>
          <b>The alert could not be sent. {err}</b><br />Call your local emergency number now (112 in India).
          <div className="row"><button className="btn d" onClick={() => send(key)}>Try again</button><button className="btn o" onClick={cancel}>Dismiss</button></div>
        </div>
      )}

      {sent && (
        <>
          <div className="note" style={{ textAlign: 'left' }}>
            <b>Alert sent.</b> {who} can see your live location.<br />
            If you are in danger, call your local emergency number now (112 in India). Move toward the nearest lit, staffed place or help point.
          </div>
          <button className="btn d" onClick={end}>Stop sharing and end SOS</button>
        </>
      )}
    </div>
  );
}
