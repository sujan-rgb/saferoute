import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, friendlyError, get, patch, post } from '../api/client.js';

export default function Contacts() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', relationship: '', phone: '', email: '', defaultSelected: true });
  const [codes, setCodes] = useState({});
  const [msg, setMsg] = useState('');
  const q = useQuery({ queryKey: ['contacts'], queryFn: () => get('/contacts') });
  const done = () => qc.invalidateQueries({ queryKey: ['contacts'] });
  const fail = (e) => setMsg(friendlyError(e));

  const add = useMutation({
    mutationFn: () => post('/contacts', { name: f.name, ...(f.relationship && { relationship: f.relationship }), ...(f.phone && { phone: f.phone }), ...(f.email && { email: f.email }), defaultSelected: f.defaultSelected }),
    onSuccess: () => { setMsg('We sent them a confirmation code. Enter it here once they share it with you.'); setF({ ...f, name: '', phone: '', email: '', relationship: '' }); done(); },
    onError: fail,
  });
  const verify = useMutation({ mutationFn: (id) => post(`/contacts/${id}/verify`, { code: codes[id] }), onSuccess: () => { setMsg(''); done(); }, onError: fail });
  const toggle = useMutation({ mutationFn: ({ id, on }) => patch(`/contacts/${id}`, { defaultSelected: on }), onSuccess: done });
  const remove = useMutation({ mutationFn: (id) => del(`/contacts/${id}`), onSuccess: done });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="g">
      <div className="pn">
        <h2>Trusted contacts</h2>
        <p className="mu">Contacts must confirm before they can receive Safe Walk updates or SOS alerts.</p>
        {(q.data ?? []).map((c) => (
          <div className="ct" key={c.id}>
            <span><b>{c.name}</b>{c.relationship && ` (${c.relationship})`}<br /><span className="mu">{c.phone ?? c.email}</span></span>
            {c.verified ? (
              <label className="c"><input type="checkbox" checked={c.defaultSelected} onChange={(e) => toggle.mutate({ id: c.id, on: e.target.checked })} />Alert by default</label>
            ) : (
              <span className="row">
                <input type="text" inputMode="numeric" maxLength={6} placeholder="6-digit code" style={{ width: 130 }} value={codes[c.id] ?? ''} onChange={(e) => setCodes({ ...codes, [c.id]: e.target.value })} />
                <button className="btn" onClick={() => verify.mutate(c.id)}>Confirm</button>
              </span>
            )}
            <button className="btn o" onClick={() => remove.mutate(c.id)}>Remove</button>
          </div>
        ))}
        {!q.data?.length && <p className="mu">No contacts yet.</p>}
        {msg && <p className="note">{msg}</p>}
      </div>
      <div className="pn">
        <h2>Add a contact</h2>
        <label className="fld" htmlFor="cn">Name</label><input id="cn" type="text" value={f.name} onChange={set('name')} />
        <label className="fld" htmlFor="cr">Relationship (optional)</label><input id="cr" type="text" value={f.relationship} onChange={set('relationship')} />
        <label className="fld" htmlFor="cp">Phone, e.g. +919876543210</label><input id="cp" type="text" value={f.phone} onChange={set('phone')} />
        <label className="fld" htmlFor="ce">Email</label><input id="ce" type="text" value={f.email} onChange={set('email')} />
        <label className="c"><input type="checkbox" checked={f.defaultSelected} onChange={(e) => setF({ ...f, defaultSelected: e.target.checked })} />Alert by default</label>
        <div className="row"><button className="btn" onClick={() => add.mutate()} disabled={add.isPending}>Send confirmation code</button></div>
      </div>
    </div>
  );
}
