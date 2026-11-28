// Search and paging for the long lists (quick scans, shared reports, scan history, client projects). Plain links and a GET form: it works
// without JavaScript, the browser's back button walks through pages, and a filtered page can be shared as a link.
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export const PAGE_SIZE = 10;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim();

/** The rows matching the search (every word must appear in one of the row's texts), then one page of them. */
export function listPage<T>(rows: T[], texts: (r: T) => (string | null | undefined)[], params: { q?: string; page?: string }) {
  const q = (params.q ?? '').trim().slice(0, 80);
  const words = norm(q).split(' ').filter(Boolean);
  const matched = words.length ? rows.filter((r) => { const hay = norm(texts(r).filter(Boolean).join(' ')); return words.every((w) => hay.includes(w)); }) : rows;
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1));
  return { q, page, pages, total: rows.length, matched: matched.length, rows: matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

const href = (base: string, q: string, page: number) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (page > 1) p.set('page', String(page)); const s = p.toString(); return s ? `${base}?${s}` : base; };

export function SearchBar({ base, q, label, placeholder }: { base: string; q: string; label: string; placeholder: string }) {
  return (
    <form action={base} method="get" role="search" aria-label={label} className="flex w-full max-w-md items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pine-500" />
        <input type="search" name="q" defaultValue={q} placeholder={placeholder} autoComplete="off"
          className="h-11 w-full rounded-xl border border-pine-300 bg-white pl-9 pr-3 text-[15px] text-ink placeholder:text-pine-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#7c5cf0]/40" />
      </label>
      <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-[15px] font-semibold text-white hover:bg-pine-700">Search</button>
      {q && <Link href={base} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-pine-700 underline-offset-4 hover:underline"><X aria-hidden className="size-4" />Clear</Link>}
    </form>
  );
}

/** "Showing 11–20 of 34" with previous, numbered and next links. Nothing when everything fits on one page. */
export function Pager({ base, q, page, pages, matched, noun }: { base: string; q: string; page: number; pages: number; matched: number; noun: string }) {
  const from = matched ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(matched, page * PAGE_SIZE);
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const btn = 'inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl px-2.5 text-sm font-semibold';
  return (
    <nav aria-label={`${noun} pages`} className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-line px-1 py-3">
      <p className="text-sm text-pine-600" aria-live="polite">{matched ? `Showing ${from}–${to} of ${matched} ${noun}${matched === 1 ? '' : 's'}` : `No ${noun}s match`}{q ? ` for “${q}”` : ''}</p>
      {pages > 1 && <ul className="flex flex-wrap items-center gap-1">
        <li>{page > 1 ? <Link href={href(base, q, page - 1)} className={cn(btn, 'border border-pine-300 bg-white text-ink hover:bg-pine-50')}><ChevronLeft aria-hidden className="size-4" />Previous</Link> : <span aria-disabled className={cn(btn, 'border border-stone-line text-pine-400')}><ChevronLeft aria-hidden className="size-4" />Previous</span>}</li>
        {nums.map((n, i) => <li key={n} className="flex items-center gap-1">{i > 0 && n - nums[i - 1] > 1 && <span aria-hidden className="px-1 text-pine-500">…</span>}
          <Link href={href(base, q, n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} className={cn(btn, n === page ? 'bg-[#432099] text-white' : 'text-ink hover:bg-[#ece6ff]')}>{n}</Link></li>)}
        <li>{page < pages ? <Link href={href(base, q, page + 1)} className={cn(btn, 'border border-pine-300 bg-white text-ink hover:bg-pine-50')}>Next<ChevronRight aria-hidden className="size-4" /></Link> : <span aria-disabled className={cn(btn, 'border border-stone-line text-pine-400')}>Next<ChevronRight aria-hidden className="size-4" /></span>}</li>
      </ul>}
    </nav>
  );
}
