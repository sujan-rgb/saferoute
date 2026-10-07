import { useEffect, useRef, useState } from 'react';

// Counts seconds down to 0, then calls onDone once. cancel() stops it with no callback.
export function useCountdown(seconds, onDone) {
  const [left, setLeft] = useState(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (left === null) return undefined;
    if (left <= 0) { setLeft(null); done.current(); return undefined; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, running: left !== null, start: () => setLeft(seconds), cancel: () => setLeft(null) };
}
