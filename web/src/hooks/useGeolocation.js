import { useEffect, useState } from 'react';

// Watches the device position only while `enabled`; the watch is always cleared on unmount or when disabled.
export function useGeolocation(enabled) {
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) { setPos(null); return undefined; }
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return undefined; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setError(null); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }); },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { pos, error };
}
