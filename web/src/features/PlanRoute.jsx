import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { get } from '../api/client.js';
import { DEFAULT_TRIP, ROUTE_COLOR } from '../config.js';
import { useSelection } from '../hooks/useSelection.jsx';
import MapView from '../components/MapView.jsx';

export default function PlanRoute() {
  const nav = useNavigate();
  const { setSel } = useSelection();
  const [mode, setMode] = useState('walking');
  const [slot, setSlot] = useState('auto');            // 'auto' = time of day on campus; chips override it
  const [selCode, setSelCode] = useState('safest');
  const [layers, setLayers] = useState({ l: true, h: true, r: true });

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => get('/meta'), staleTime: Infinity });
  const trip = useQuery({
    queryKey: ['routes', DEFAULT_TRIP.from, DEFAULT_TRIP.to, mode, slot],
    queryFn: () => get(`/routes?from=${DEFAULT_TRIP.from}&to=${DEFAULT_TRIP.to}&mode=${mode}&slot=${slot}`),
    placeholderData: keepPreviousData,
  });
  const walk = useQuery({ queryKey: ['walk-active'], queryFn: () => get('/safe-walk/active'), refetchInterval: 5000 });

  const data = trip.data;
  const sel = data?.routes.find((r) => r.code === selCode) ?? data?.routes[0];
  useEffect(() => { if (sel) setSel({ routeId: sel.id, label: sel.label }); }, [sel?.id]);   // eslint-disable-line

  if (!data || !meta.data) return <p className="mu">Loading routes…</p>;
  if (!data.routes.length) return <div className="pn"><p className="mu">No routes are mapped for this trip yet.</p></div>;

  const walkSession = walk.data?.session;
  const walker = walkSession?.progress != null ? { routeId: walkSession.routeId, progress: walkSession.progress } : null;
  const weak = sel.weakest;
  const toggle = (k) => setLayers((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="g">
      <div className="pn">
        <MapView data={data} selectedCode={sel.code} layers={layers} walker={walker} />
        <div className="row">
          <label className="c"><input type="checkbox" checked={layers.l} onChange={() => toggle('l')} />Lighting</label>
          <label className="c"><input type="checkbox" checked={layers.h} onChange={() => toggle('h')} />Help points</label>
          <label className="c"><input type="checkbox" checked={layers.r} onChange={() => toggle('r')} />Verified reports</label>
        </div>
      </div>

      <div>
        <div className="pn">
          <h2>{data.origin.name} to {data.destination.name}</h2>
          <div className="row" aria-label="Travel mode">
            {meta.data.modes.map((m) => (
              <button key={m.code} className={`chip ${m.code === data.mode.code ? 'on' : ''}`} onClick={() => setMode(m.code)}>{m.label}</button>
            ))}
          </div>
          <div className="row" aria-label="Time of day">
            {meta.data.timeSlots.map((s) => (
              <button key={s.code} className={`chip ${s.code === data.slot.code ? 'on' : ''}`} onClick={() => setSlot(s.code)}>{s.label}</button>
            ))}
          </div>

          {data.routes.map((r) => (
            <button key={r.id} className={`rc ${r.code === sel.code ? 'on' : ''}`} style={{ '--c': ROUTE_COLOR[r.code] }} onClick={() => setSelCode(r.code)}>
              <b>{r.label}</b><span className="sc">{r.score}</span>
              <span className="mu">{r.distanceKm} km · {r.minutes} min</span>
            </button>
          ))}

          <h3>Why the {sel.label} route scores {sel.score}/100</h3>
          {sel.factors.map((f) => (
            <div className="fl" key={f.key}>
              <span>{f.label}</span><div className="bar"><i style={{ width: `${f.value}%` }} /></div><b>{f.value}</b>
            </div>
          ))}
          <p className="mu">
            Weakest factor: {weak.label.toLowerCase()} ({weak.value}).
            {sel.verifiedReportCount > 0 && ` ${sel.verifiedReportCount} verified report${sel.verifiedReportCount > 1 ? 's' : ''} on ${sel.areaName} lower this score.`}
            {' '}Weights shift toward lighting after dark.
          </p>
          <div className="note">This is a safety estimate from available data, never a guarantee. No route is labelled completely safe.</div>
          <button className="btn" onClick={() => nav('/safe-walk')}>Start Safe Walk on this route</button>
        </div>
      </div>
    </div>
  );
}
