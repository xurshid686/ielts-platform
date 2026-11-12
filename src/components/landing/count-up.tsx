"use client";

import { useEffect, useRef } from "react";

const format = (n: number) => n.toLocaleString("en-US");
const DURATION_MS = 1100;

/**
 * A figure that counts up to its value ONCE, the first time it scrolls into
 * view. The landing page's single piece of scroll motion.
 *
 * The server renders the real number, and it stays the real number whenever
 * counting would be wrong or jarring:
 *   - no JavaScript, or no IntersectionObserver;
 *   - the visitor prefers reduced motion;
 *   - the figure is ALREADY on screen when the page hydrates (a tall window) —
 *     resetting a number the visitor is looking at to 0 would be a flash.
 * Only a figure still below the fold is set to 0, out of sight, and counted up
 * when it arrives.
 *
 * The text is written straight to the DOM, not through state: 60 renders a
 * second for a number is waste, and the props never change so React never
 * writes over it. A screen reader gets the final value only.
 */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    let frame = 0;
    el.textContent = format(0);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / DURATION_MS);
          // Ease-out cubic: fast at first, settling onto the real number.
          el.textContent = format(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [value]);

  return (
    <>
      <span className="sr-only">{format(value)}</span>
      <span ref={ref} aria-hidden>
        {format(value)}
      </span>
    </>
  );
}
