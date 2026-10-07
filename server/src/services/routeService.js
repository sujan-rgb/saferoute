import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { pointAlong } from '../utils/geo.js';
import { scoreRoute, minutes } from './scoring.js';

const rows = async (sql, params = []) => (await pool.execute(sql, params))[0];
const rowsIn = async (sql, params) => (await pool.query(sql, params))[0];   // query() expands IN (?) arrays; still parameterised

function campusHour() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: env.CAMPUS_TZ, hour: '2-digit', hour12: false }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour').value) % 24;
}

export async function currentSlot() {
  const h = campusHour();
  const [slot] = await rows(
    `SELECT * FROM time_slots
      WHERE (start_hour < end_hour AND ? >= start_hour AND ? < end_hour)
         OR (start_hour > end_hour AND (? >= start_hour OR ? < end_hour)) LIMIT 1`, [h, h, h, h]);
  return slot;
}

export async function getMeta() {
  const [modes, timeSlots, places, slot] = await Promise.all([
    rows('SELECT code, label, speed_kmh AS speedKmh FROM travel_modes ORDER BY speed_kmh'),
    rows('SELECT code, label FROM time_slots ORDER BY id'),
    rows("SELECT code, name FROM map_nodes WHERE node_type = 'landmark' ORDER BY name"),
    currentSlot(),
  ]);
  return { modes, timeSlots, places, defaultSlot: slot?.code };
}

export async function getRouteOptions({ from, to, modeCode, slotCode }) {
  const [[origin], [destination], [mode]] = await Promise.all([
    rows('SELECT id, code, name, lat, lng FROM map_nodes WHERE code = ?', [from]),
    rows('SELECT id, code, name, lat, lng FROM map_nodes WHERE code = ?', [to]),
    rows('SELECT code, label, speed_kmh FROM travel_modes WHERE code = ?', [modeCode]),
  ]);
  const slot = slotCode === 'auto' ? await currentSlot() : (await rows('SELECT * FROM time_slots WHERE code = ?', [slotCode]))[0];
  if (!origin || !destination || !mode || !slot) return null;

  const routes = await rows(
    `SELECT id, code, label, area_name, distance_km, base_report_score FROM routes
      WHERE origin_node_id = ? AND destination_node_id = ? AND is_active = 1 ORDER BY sort_order`, [origin.id, destination.id]);
  const head = { origin, destination, mode: { code: mode.code, label: mode.label }, slot: { code: slot.code, label: slot.label } };
  if (!routes.length) return { ...head, routes: [], helpPoints: [], reportMarkers: [] };

  const ids = routes.map((r) => r.id);
  const [wps, profiles, counts, markers, helpPoints] = await Promise.all([
    rowsIn(`SELECT w.route_id, n.lat, n.lng FROM route_waypoints w JOIN map_nodes n ON n.id = w.node_id
             WHERE w.route_id IN (?) ORDER BY w.route_id, w.seq`, [ids]),
    rowsIn('SELECT route_id, lighting, activity, help FROM route_time_profiles WHERE time_slot_id = ? AND route_id IN (?)', [slot.id, ids]),
    rowsIn(`SELECT route_id, COUNT(*) AS n FROM reports
             WHERE status = 'verified' AND resolved_at IS NULL AND route_id IN (?) GROUP BY route_id`, [ids]),
    rowsIn(`SELECT id, route_id, category, description, lat, lng FROM reports
             WHERE status = 'verified' AND resolved_at IS NULL AND route_id IN (?)`, [ids]),
    rows('SELECT id, type, name, lat, lng FROM help_points WHERE is_active = 1'),
  ]);

  const weights = { lighting: slot.w_lighting, activity: slot.w_activity, help: slot.w_help, reports: slot.w_reports };
  const paths = new Map();
  for (const r of routes) paths.set(r.id, wps.filter((w) => w.route_id === r.id).map(({ lat, lng }) => ({ lat, lng })));

  const out = routes.flatMap((r) => {
    const profile = profiles.find((p) => p.route_id === r.id);
    if (!profile) return [];                                    // route has no data for this slot
    const verifiedReportCount = counts.find((c) => c.route_id === r.id)?.n ?? 0;
    const s = scoreRoute({ profile, weights, baseReportScore: r.base_report_score, verifiedCount: verifiedReportCount });
    return [{
      id: r.id, code: r.code, label: r.label, areaName: r.area_name, distanceKm: r.distance_km,
      minutes: minutes(r.distance_km, mode.speed_kmh),
      score: s.score, factors: s.factors, weakest: s.weakest, verifiedReportCount, path: paths.get(r.id),
    }];
  });

  const reportMarkers = markers.map((m) => ({
    id: m.id, routeId: m.route_id, category: m.category, description: m.description,
    ...(m.lat != null ? { lat: m.lat, lng: m.lng } : pointAlong(paths.get(m.route_id), 0.45)),
  }));

  return { ...head, routes: out, helpPoints, reportMarkers };
}
