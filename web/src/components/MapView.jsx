// Port of the prototype's map(). Same 600x380 schematic; real lat/lng from the API are projected into it.
const STROKE = { fastest: '#9aa9b4', balanced: '#9b92ff', safest: '#3cc4c6' };

function makeProject(points) {
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const dx = maxLng - minLng || 1, dy = maxLat - minLat || 1;
  return (p) => [50 + ((p.lng - minLng) / dx) * 500, 60 + ((maxLat - p.lat) / dy) * 260];
}

// point at fraction t along a polyline of [x, y] pairs (prototype pt())
function pointOn(p, t) {
  const L = []; let T = 0;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); L.push(d); T += d; }
  let x = t * T;
  for (let i = 0; i < L.length; i++) {
    if (x <= L[i] || i === L.length - 1) {
      const u = L[i] ? Math.min(1, x / L[i]) : 0;
      return [p[i][0] + (p[i + 1][0] - p[i][0]) * u, p[i][1] + (p[i + 1][1] - p[i][1]) * u];
    }
    x -= L[i];
  }
  return p[0];
}

// data: response of GET /api/routes. walker: { routeId, progress } | null
export default function MapView({ data, selectedCode, layers, walker }) {
  const { routes, helpPoints, reportMarkers, origin, destination } = data;
  const P = makeProject([origin, destination, ...routes.flatMap((r) => r.path), ...helpPoints]);
  const paths = Object.fromEntries(routes.map((r) => [r.id, r.path.map(P)]));
  const o = P(origin), d = P(destination);
  const lighting = (r) => r.factors.find((f) => f.key === 'lighting').value;
  const w = walker && paths[walker.routeId] ? pointOn(paths[walker.routeId], walker.progress) : null;

  return (
    <svg viewBox="0 0 600 380" role="img" aria-label="Map with route options">
      <rect width="600" height="380" fill="#0f1b26" />
      {[1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${i * 100} 0V380M0 ${i * 63}H600`} stroke="#1d2e3d" strokeWidth="2" />)}

      {routes.map((r) => {
        const on = r.code === selectedCode;
        return <polyline key={r.id} points={paths[r.id].map((p) => p.join(',')).join(' ')} fill="none" stroke={STROKE[r.code]}
          strokeWidth={on ? 7 : 4} strokeLinecap="round" strokeLinejoin="round" opacity={on ? 1 : 0.35} />;
      })}

      {layers.l && routes.flatMap((r) => {
        const n = Math.round(lighting(r) / 14);
        return Array.from({ length: n }, (_, k) => {
          const q = pointOn(paths[r.id], (k + 1) / (n + 1));
          return <circle key={`${r.id}-${k}`} cx={q[0]} cy={q[1] - 9} r="3.5" fill="#f2b84b" />;
        });
      })}

      {layers.h && helpPoints.map((h) => {
        const [x, y] = P(h);
        return (
          <g key={h.id}>
            <rect x={x - 8} y={y - 8} width="16" height="16" rx="3" fill="#2f6fed" />
            <path d={`M${x} ${y - 5}v10M${x - 5} ${y}h10`} stroke="#fff" strokeWidth="2.5" />
            <title>{h.name}</title>
          </g>
        );
      })}

      {layers.r && reportMarkers.map((m) => {
        const [x, y] = P(m);
        return (
          <g key={m.id}>
            <path d={`M${x} ${y + 14}l-11 -20h22z`} fill="#ef4444" />
            <text x={x} y={y + 11} fontSize="11" fill="#fff" textAnchor="middle" fontWeight="800">!</text>
            <title>{m.description}</title>
          </g>
        );
      })}

      <circle cx={o[0]} cy={o[1]} r="9" fill="#fff" />
      <text x={o[0] + 14} y={o[1] + 16} fill="#e7eef3" fontSize="13">{origin.name}</text>
      <circle cx={d[0]} cy={d[1]} r="9" fill="#fff" />
      <text x={d[0] - 2} y={d[1] - 16} fill="#e7eef3" fontSize="13" textAnchor="end">{destination.name}</text>

      {w && <circle cx={w[0]} cy={w[1]} r="9" fill="#f2b84b" stroke="#fff" strokeWidth="3" />}
    </svg>
  );
}
