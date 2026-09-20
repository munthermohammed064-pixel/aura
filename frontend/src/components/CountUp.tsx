"use client";

import { useEffect, useRef, useState } from "react";

export function CountUp({ value, decimals = 2, prefix = "", className = "" }: {
  value: number; decimals?: number; prefix?: string; className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const fromRef = useRef(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setIsVisible(true); obs.disconnect(); }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Animate from current displayed value to the new one — runs on first
  // visibility AND whenever `value` changes (e.g. live balance refresh).
  useEffect(() => {
    if (!isVisible) return;
    const from = fromRef.current;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const v = from + (value - from) * (1 - Math.pow(1 - p, 3)); // ease-out cubic
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, isVisible]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {prefix}{display.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })}
    </span>
  );
}
