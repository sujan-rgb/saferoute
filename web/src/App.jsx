import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.jsx';
import { SelectionProvider } from './hooks/useSelection.jsx';
import PlanRoute from './features/PlanRoute.jsx';
import SafeWalk from './features/SafeWalk.jsx';
import Sos from './features/Sos.jsx';
import Report from './features/Report.jsx';
import Insights from './features/Insights.jsx';
import Contacts from './features/Contacts.jsx';
import About from './features/About.jsx';
import Login from './features/Login.jsx';
import Shared from './features/Shared.jsx';

function Shell() {
  const { user, logout } = useAuth();
  const staff = ['moderator', 'admin'].includes(user.role);
  const tabs = [['/plan', 'Plan route'], ['/safe-walk', 'Safe Walk'], ['/sos', 'SOS'], ['/report', 'Report'],
    ...(staff ? [['/insights', 'Campus insights']] : []), ['/contacts', 'Contacts'], ['/about', 'About']];
  return (
    <SelectionProvider>
      <header>
        <div><h1>SafeRoute</h1><p>The safest path, not just the shortest path.</p></div>
        <div className="row"><span className="mu">{user.displayName}</span><button className="btn o" onClick={() => logout.mutate()}>Sign out</button></div>
      </header>
      <nav>{tabs.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>)}</nav>
      <main>
        <Routes>
          <Route path="/plan" element={<PlanRoute />} />
          <Route path="/safe-walk" element={<SafeWalk />} />
          <Route path="/sos" element={<Sos />} />
          <Route path="/report" element={<Report />} />
          <Route path="/insights" element={staff ? <Insights /> : <Navigate to="/plan" replace />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
    </SelectionProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <main><p className="mu">Loading…</p></main>;
  return user ? <Shell /> : <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/s/:token" element={<Shared />} />
      <Route path="/*" element={<AuthGate />} />
    </Routes>
  );
}
