// Pure scoring logic ported 1:1 from the prototype's sc() and mins(). No I/O, so it is unit-testable.
export const REPORT_PENALTY = 8;   // prototype: each verified report on a route lowers its "Verified reports" factor by 8

export function scoreRoute({ profile, weights, baseReportScore, verifiedCount }) {
  const factors = [
    { key: 'lighting', label: 'Lighting',             value: profile.lighting, weight: weights.lighting },
    { key: 'activity', label: 'Active public places', value: profile.activity, weight: weights.activity },
    { key: 'help',     label: 'Help points nearby',   value: profile.help,     weight: weights.help },
    { key: 'reports',  label: 'Verified reports',     value: Math.max(0, baseReportScore - REPORT_PENALTY * verifiedCount), weight: weights.reports },
  ];
  const score = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0));
  const weakest = factors.reduce((a, b) => (b.value < a.value ? b : a));   // ties keep the first, as in the prototype
  return { score, factors, weakest };
}

export const minutes = (km, speedKmh) => Math.max(1, Math.round((km / speedKmh) * 60));
