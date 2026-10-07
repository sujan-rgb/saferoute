import { useState } from 'react';
import { friendlyError } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ displayName: '', email: '', password: '' });
  const m = mode === 'login' ? login : register;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => { e.preventDefault(); m.mutate(mode === 'login' ? { email: f.email, password: f.password } : f); };
  return (
    <main>
      <div className="pn auth">
        <h1>SafeRoute</h1>
        <p className="mu">The safest path, not just the shortest path.</p>
        <form onSubmit={submit}>
          {mode === 'register' && (<><label className="fld" htmlFor="dn">Name</label><input id="dn" type="text" value={f.displayName} onChange={set('displayName')} required /></>)}
          <label className="fld" htmlFor="em">Email</label><input id="em" type="text" autoComplete="username" value={f.email} onChange={set('email')} required />
          <label className="fld" htmlFor="pw">Password{mode === 'register' && ' (12 characters or more)'}</label>
          <input id="pw" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} required />
          {m.isError && <p className="err">{friendlyError(m.error)}</p>}
          <div className="row"><button className="btn" type="submit" disabled={m.isPending}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button className="btn o" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'I have an account'}</button></div>
        </form>
      </div>
    </main>
  );
}
