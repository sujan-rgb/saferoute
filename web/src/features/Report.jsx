import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { friendlyError, get, patch, post } from '../api/client.js';
import { CATEGORIES, DEFAULT_TRIP, categoryLabel } from '../config.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Report() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const staff = ['moderator', 'admin'].includes(user.role);
  const [category, setCategory] = useState(CATEGORIES[0][0]);
  const [routeId, setRouteId] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const trip = useQuery({
    queryKey: ['routes', DEFAULT_TRIP.from, DEFAULT_TRIP.to, 'walking', 'auto'],
    queryFn: () => get(`/routes?from=${DEFAULT_TRIP.from}&to=${DEFAULT_TRIP.to}&mode=walking&slot=auto`),
    placeholderData: keepPreviousData,
  });
  const quota = useQuery({ queryKey: ['report-quota'], queryFn: () => get('/reports/quota') });
  const list = useQuery({
    queryKey: [staff ? 'mod-reports' : 'my-reports'],
    queryFn: () => get(staff ? '/moderation/reports?status=all' : '/reports/mine'),
  });
  const routes = trip.data?.routes ?? [];
  const where = routeId || routes[0]?.id || '';

  const submit = useMutation({
    mutationFn: () => post('/reports', { category, routeId: Number(where), description: text }),
    onSuccess: () => {
      setMsg('Report submitted for moderation. It will count toward scores once verified.'); setText('');
      qc.invalidateQueries({ queryKey: ['report-quota'] }); qc.invalidateQueries({ queryKey: ['my-reports'] }); qc.invalidateQueries({ queryKey: ['mod-reports'] });
    },
    onError: (e) => setMsg(friendlyError(e)),
  });
  const act = useMutation({
    mutationFn: ({ id, status, resolve }) => (resolve ? post(`/moderation/reports/${id}/resolve`) : patch(`/moderation/reports/${id}`, { status })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mod-reports'] }); qc.invalidateQueries({ queryKey: ['routes'] }); qc.invalidateQueries({ queryKey: ['insights'] }); },
  });

  return (
    <div className="g">
      <div className="pn">
        <h2>Report a concern</h2>
        <p className="mu">Reports are moderated before they affect route scores. Rate limit: {quota.data?.remaining ?? '…'} of {quota.data?.limit ?? 3} reports left this hour.</p>
        <label className="fld" htmlFor="rc">Type</label>
        <select id="rc" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="fld" htmlFor="ra">Where</label>
        <select id="ra" value={where} onChange={(e) => setRouteId(e.target.value)}>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.areaName}</option>)}
        </select>
        <label className="fld" htmlFor="rt">Details</label>
        <textarea id="rt" rows={3} maxLength={140} placeholder="What did you see?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row"><button className="btn" disabled={submit.isPending || !where} onClick={() => (text.trim() ? submit.mutate() : setMsg('Add a short description first.'))}>Submit report</button></div>
        {msg && <p className="note">{msg}</p>}
      </div>

      <div className="pn">
        <h2>{staff ? 'Moderation queue' : 'Your reports'}</h2>
        {(list.data ?? []).map((x) => (
          <div key={x.id} style={{ padding: '8px 0', borderTop: '1px solid var(--ln)' }}>
            <span className={`st ${x.status}`}>{x.status}</span> <b>{categoryLabel(x.category)}</b> on {x.areaName}
            {x.resolvedAt && <span className="mu"> · fixed</span>}
            <br /><span className="mu">{x.description}</span>
            {staff && x.status === 'pending' && (
              <div className="row">
                <button className="btn" onClick={() => act.mutate({ id: x.id, status: 'verified' })}>Moderator: verify</button>
                <button className="btn o" onClick={() => act.mutate({ id: x.id, status: 'rejected' })}>Reject</button>
              </div>
            )}
            {staff && x.status === 'verified' && !x.resolvedAt && (
              <div className="row"><button className="btn o" onClick={() => act.mutate({ id: x.id, resolve: true })}>Mark as fixed</button></div>
            )}
          </div>
        ))}
        {!list.data?.length && <p className="mu">No reports yet.</p>}
        {staff && <p className="mu">Verify a report, then open Plan route: that route&apos;s score drops and a red marker appears.</p>}
      </div>
    </div>
  );
}
