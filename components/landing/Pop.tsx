'use client';
// Decoration that pops in once when it scrolls into view. It starts visible (so server output and
// no-JS are complete) and is only hidden if it is below the fold at load. Never wrap real text in it.
import * as React from 'react';

export function Pop({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [state, setState] = React.useState<'pre' | 'in'>('in');
  React.useEffect(() => {
    const el = ref.current; if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('pre');
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setState('in'); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <span ref={ref} data-pop={state} style={{ '--d': `${delay}ms` } as React.CSSProperties} className={`inline-block ${className}`}>{children}</span>;
}
