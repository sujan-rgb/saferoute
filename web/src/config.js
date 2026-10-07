// The prototype is fixed to one trip. Add routes in the database and surface a picker when you need more.
export const DEFAULT_TRIP = { from: 'library', to: 'hostel-c' };

export const CATEGORIES = [
  ['broken_light', 'Broken light'],
  ['unsafe_path', 'Unsafe path'],
  ['harassment_concern', 'Harassment concern'],
  ['hazard', 'Hazard'],
];
export const categoryLabel = (c) => CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

export const ROUTE_COLOR = { fastest: 'var(--fs)', balanced: 'var(--bl)', safest: 'var(--sf)' };
