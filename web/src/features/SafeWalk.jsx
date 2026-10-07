import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { friendlyError, get, post } from '../api/client.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useSelection } from '../hooks/useSelection.jsx';

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function SafeWalk() {
  const qc = useQueryClient();
  const { sel } = useSelection();
  const [picked, setPicked] = useState(null);            // null = the contacts marked as default
  const [dur, setDur] = useState(60);
  const [msg, setMsg] = useState('');

  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => get('/contacts') });
  const active = useQuery({ queryKey: ['walk-active'], queryFn: () => get('/safe-walk/active'), refetchInterval: 5000 });
  const session = active.data?.session;
  const logId = session?.id ?? active.data?.lastSessionId;
  const events = useQuery({ queryKey: ['walk-events', logId], queryFn: () => get(`/safe-walk/${logId}/events`), enabled: !!logId, refetchInterval: session ? 5000 : false });

  const list = contacts.data ?? [];
  const ticked = session ? session.contactIds : picked ?? list.filter((c) => c.verified && c.defaultSelected).map((c) => c.id);

  // Share position only while a walk is active; the server keeps just the latest fix.
  const { pos } = useGeolocation(!!session);
  const posRef = useRef(null);
  posRef.current = pos;
  useEffect(() => {
    if (!session) return undefined;
    const send = () => { if (posRef.current) post(`/safe-walk/${session.id}/position`, posRef.current).catch(() => {}); };
    send();
    const t = setInterval(send, 10_000);
    return () => clearInterval(t);
  }, [session?.id]);                                      // eslint-disable-line

  const refresh = () => { qc.invalidateQueries({ queryKey: ['walk-active'] }); qc.invalidateQueries({ queryKey: ['walk-events'] }); };
  const useAction = (fn) => useMutation({ mutationFn: fn, onSuccess: () => { setMsg(''); refresh(); }, onError: (e) => setMsg(friendlyError(e)) });
  const start = useAction(() => post('/safe-walk', { routeId: sel.routeId, contactIds: ticked, durationMin: dur }));
  const checkIn = useAction(() => post(`/safe-walk/${session.id}/check-in`));
  const arrive = useAction(() => post(`/safe-walk/${session.id}/arrive`));
  const stop = useAction(() => post(`/safe-walk/${session.id}/stop`));
  const missed = useAction(() => post(`/safe-walk/${session.id}/simulate-missed`));

  const onStart = () => {
    if (!sel) return setMsg('Choose a route in Plan route first.');
    if (!ticked.length) return setMsg('Pick at least one trusted contact first.');
    start.mutate();
  };
  const toggle = (id, on) => setPicked(on ? [...ticked, id] : ticked.filter((x) => x !== id));

  return (
    <div className="g">
      <div className="pn">
        <h2>Safe Walk Mode</h2>
        <p className="mu">Tracking is opt-in, time-limited and easy to stop. Only the contacts you choose can see your journey.</p>

        <h3>Trusted contacts</h3>
        {list.length === 0 && <p className="mu">No contacts yet. <Link to="/contacts">Add a trusted contact</Link>.</p>}
        {list.map((c) => (
          <label className="c" key={c.id}>
            <input type="checkbox" checked={ticked.includes(c.id)} disabled={!!session || !c.verified} onChange={(e) => toggle(c.id, e.target.checked)} />
            {c.name}{c.relationship ? ` (${c.relationship.toLowerCase()})` : ''}{!c.verified && ' · waiting for confirmation'}
          </label>
        ))}

        <h3>Sharing time limit</h3>
        <select value={session?.durationMin ?? dur} disabled={!!session} onChange={(e) => setDur(Number(e.target.value))}>
          {[30, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
        </select>

        {msg && <p className="note">{msg}</p>}

        {session ? (
          <>
            <h3>Journey in progress ({session.routeLabel} route)</h3>
            <div className="bar" role="progressbar" aria-valuenow={Math.round((session.progress ?? 0) * 100)} aria-valuemin="0" aria-valuemax="100">
              <i style={{ width: `${(session.progress ?? 0) * 100}%` }} />
            </div>
            {session.progress == null && <p className="mu">Waiting for your first location update.</p>}
            <div className="row">
              <button className="btn o" onClick={() => checkIn.mutate()}>Check in: I&apos;m okay</button>
              <button className="btn" onClick={() => arrive.mutate()}>Arrived safely</button>
              {import.meta.env.DEV && <button className="btn o" onClick={() => missed.mutate()}>Simulate missed check-in</button>}
              <button className="btn d" onClick={() => stop.mutate()}>Stop sharing now</button>
            </div>
          </>
        ) : (
          <div className="row"><button className="btn" onClick={onStart} disabled={start.isPending}>Start Safe Walk</button></div>
        )}
      </div>

      <div className="pn">
        <h2>What your contacts see</h2>
        {events.data?.length ? (
          <ul className="log">{events.data.map((e, i) => <li key={i}>{clock(e.at)} · {e.message}</li>)}</ul>
        ) : <p className="mu">Nothing yet. Start a Safe Walk to send the first update.</p>}
      </div>
    </div>
  );
}
