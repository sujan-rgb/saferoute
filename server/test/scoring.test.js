import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRoute, minutes } from '../src/services/scoring.js';

// Verbatim data and formulas from SafeRoute_prototype.html
const R = {
  fast: { km: 1.2, f: { l: [78, 52, 28], a: [70, 48, 22], h: [40, 40, 40], r: 62 } },
  bal:  { km: 1.4, f: { l: [85, 72, 58], a: [75, 65, 50], h: [60, 60, 60], r: 80 } },
  safe: { km: 1.7, f: { l: [92, 88, 84], a: [78, 74, 66], h: [82, 82, 82], r: 90 } },
};
const W = [[.15, .25, .25, .35], [.3, .25, .2, .25], [.4, .2, .2, .2]];
const M = { Walking: 5, Cycling: 14, 'Campus ride': 20 };
function protoScore(k, t, v) {
  const f = R[k].f, w = W[t];
  const P = [['Lighting', f.l[t]], ['Active public places', f.a[t]], ['Help points nearby', f.h[t]], ['Verified reports', Math.max(0, f.r - 8 * v)]];
  return { s: Math.round(P.reduce((a, p, i) => a + p[1] * w[i], 0)), weakest: P.reduce((a, b) => (b[1] < a[1] ? b : a)) };
}
const protoMins = (k, m) => Math.max(1, Math.round(R[k].km / M[m] * 60));

test('scores match the prototype for every route x time slot x 0..4 verified reports', () => {
  let n = 0;
  for (const k of Object.keys(R)) for (let t = 0; t < 3; t++) for (let v = 0; v <= 4; v++) {
    const f = R[k].f, w = W[t];
    const got = scoreRoute({
      profile: { lighting: f.l[t], activity: f.a[t], help: f.h[t] },
      weights: { lighting: w[0], activity: w[1], help: w[2], reports: w[3] },
      baseReportScore: f.r, verifiedCount: v,
    });
    const want = protoScore(k, t, v);
    assert.equal(got.score, want.s, `${k} t=${t} v=${v}`);
    assert.equal(got.weakest.value, want.weakest[1]);
    assert.equal(got.weakest.label, want.weakest[0]);
    n++;
  }
  assert.equal(n, 45);
});

test('travel time matches the prototype for every route x mode', () => {
  for (const k of Object.keys(R)) for (const m of Object.keys(M)) {
    assert.equal(minutes(R[k].km, M[m]), protoMins(k, m));
  }
});

test('known prototype values: safest at night is 81, fastest at night is 36', () => {
  const night = { lighting: .4, activity: .2, help: .2, reports: .2 };
  assert.equal(scoreRoute({ profile: { lighting: 84, activity: 66, help: 82 }, weights: night, baseReportScore: 90, verifiedCount: 0 }).score, 81);
  assert.equal(scoreRoute({ profile: { lighting: 28, activity: 22, help: 40 }, weights: night, baseReportScore: 62, verifiedCount: 0 }).score, 36);
});
