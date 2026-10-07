import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client.js';
import { categoryLabel } from '../config.js';

export default function Insights() {
  const q = useQuery({ queryKey: ['insights'], queryFn: () => get('/insights') });
  const cats = q.data?.byCategory ?? [];
  const actions = q.data?.suggestedActions ?? [];
  const max = Math.max(1, ...cats.map((c) => c.count));
  return (
    <div className="g">
      <div className="pn">
        <h2>Campus insights (anonymized)</h2>
        <p className="mu">Reporter identities are never shown. Only category and area trends reach campus security and facilities.</p>
        {cats.map((c) => (
          <div className="fl" key={c.category}><span>{categoryLabel(c.category)}</span><div className="bar"><i style={{ width: `${(c.count / max) * 100}%` }} /></div><b>{c.count}</b></div>
        ))}
        {!cats.length && <p className="mu">No reports yet.</p>}
      </div>
      <div className="pn">
        <h2>Suggested actions</h2>
        {actions.length ? (
          <ul>{actions.map((a) => (
            <li key={a.routeId}>Inspect lighting and path upkeep on <b>{a.areaName}</b> ({a.verifiedCount} verified report{a.verifiedCount > 1 ? 's' : ''}).</li>
          ))}</ul>
        ) : <p className="mu">Verify a report to generate maintenance and patrol suggestions.</p>}
        <p className="mu">Used to plan lighting repairs, maintenance and patrol coverage.</p>
      </div>
    </div>
  );
}
