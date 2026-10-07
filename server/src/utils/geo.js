const R_EARTH = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

// Point at fraction t (0..1) of the polyline's length.
export function pointAlong(path, t) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) { const d = haversine(path[i - 1], path[i]); lens.push(d); total += d; }
  let x = t * total;
  for (let i = 0; i < lens.length; i++) {
    if (x <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, x / lens[i]) : 0;
      return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * u, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * u };
    }
    x -= lens[i];
  }
  return path[0];
}

// How far along the polyline (0..1) is the point nearest to p. Local flat-earth projection is fine at campus scale.
export function progressAlong(path, p) {
  const k = Math.cos(rad(p.lat));
  const xy = (q) => [q.lng * k * 111_320, q.lat * 110_540];
  const P = xy(p);
  let best = { d: Infinity, at: 0 }, acc = 0, total = 0;
  const segs = [];
  for (let i = 1; i < path.length; i++) {
    const A = xy(path[i - 1]), B = xy(path[i]);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    segs.push({ A, B, len }); total += len;
  }
  for (const s of segs) {
    const t = s.len ? Math.max(0, Math.min(1, ((P[0] - s.A[0]) * (s.B[0] - s.A[0]) + (P[1] - s.A[1]) * (s.B[1] - s.A[1])) / s.len ** 2)) : 0;
    const d = Math.hypot(P[0] - (s.A[0] + t * (s.B[0] - s.A[0])), P[1] - (s.A[1] + t * (s.B[1] - s.A[1])));
    if (d < best.d) best = { d, at: acc + t * s.len };
    acc += s.len;
  }
  return total ? best.at / total : 0;
}
