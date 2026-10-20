import { useEffect, useRef, useState } from 'react';

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número com transição discreta quando o valor muda. */
export function AnimatedNumber({
  value,
  format,
  duration = 600,
}: {
  value: number | null;
  format: (n: number | null) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (
      value == null ||
      from == null ||
      from === value ||
      reduceMotion() ||
      typeof requestAnimationFrame === 'undefined'
    ) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const current = from + (value - from) * eased;
      setDisplay(Number.isInteger(value) && Number.isInteger(from) ? Math.round(current) : current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular">{format(display)}</span>;
}
