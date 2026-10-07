import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

// Public page opened from the link a trusted contact receives. No account, no cookies, token only.
export default function Shared() {
  const { token } = useParams();
  const q = useQuery({
    queryKey: ['shared', token], retry: false, refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/shared/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('failed');
      return r.json();
    },
  });
  const d = q.data;
  return (
    <main>
      <div className="pn" style={{ maxWidth: 560, margin: '24px auto' }}>
        {q.isLoading && <p className="mu">Loading…</p>}
        {q.data === null && <><h2>This link is no longer active</h2><p className="mu">Sharing has stopped or the time limit has passed.</p></>}
        {d && (
          <>
            <h2>{d.kind === 'sos' ? `${d.name} needs help` : `${d.name} is sharing a Safe Walk`}</h2>
            {d.kind === 'sos' && <div className="err">If you cannot reach {d.name}, call your local emergency number (112 in India).</div>}
            {d.location ? (
              <p>Last seen {new Date(d.location.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. {' '}
                <a href={`https://www.openstreetmap.org/?mlat=${d.location.lat}&mlon=${d.location.lng}#map=18/${d.location.lat}/${d.location.lng}`} target="_blank" rel="noopener noreferrer">Open map</a></p>
            ) : <p className="mu">Waiting for the first location update.</p>}
            {d.events.length > 0 && <ul className="log">{d.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {e.message}</li>)}</ul>}
          </>
        )}
      </div>
    </main>
  );
}
