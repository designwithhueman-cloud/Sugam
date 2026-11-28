// Small shared pieces for the signed-in dashboard: initials avatars, dates people read at a glance, and the two button looks.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

// Soft tints with dark text (each pair is at least 7:1). Picked from the name so a project keeps its colour.
const TINTS = ['bg-[#fde9d7] text-[#6b2f0c]', 'bg-[#ece6ff] text-[#35197a]', 'bg-[#f5efd6] text-[#4d3f0a]', 'bg-[#dcf3e7] text-[#174a32]', 'bg-[#e3eefb] text-[#173a66]'];
export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const [a, b = ''] = words.length > 1 ? [words[0][0], words[1][0]] : [words[0][0], words[0][1] ?? ''];
  return a.toUpperCase() + b.toLowerCase();
}
export function Initials({ name, className }: { name: string; className?: string }) {
  const h = [...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold', TINTS[h % TINTS.length], className)}>{initials(name)}</span>;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** "Today", "Yesterday", or "Nov 18" (with the year when it is not this year). The full date and time is in the title and datetime. */
export function DayDate({ date, className, lower }: { date: Date; className?: string; lower?: boolean }) {
  const now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1);
  const label = sameDay(date, now) ? (lower ? 'today' : 'Today') : sameDay(date, y) ? (lower ? 'yesterday' : 'Yesterday') : date.toLocaleDateString('en', { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  const full = date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
  return <time dateTime={date.toISOString()} title={full} className={className}>{label}</time>;
}
/** "Nov 20, 4:05 PM", with the year only when it is not this year. */
export const shortDate = (d: Date) => d.toLocaleString('en', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' });
export const fullDate = (d: Date) => d.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

export const btnPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-white transition-colors hover:bg-pine-700';
export const btnOutline = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-pine-300 bg-white px-3.5 text-sm font-semibold text-ink transition-colors hover:border-pine-500 hover:bg-pine-50';

/** "Open report →" with the item's name added for assistive technology (the visible words come first, so voice control still works). */
export function OpenLink({ href, name, label = 'Open report' }: { href: string; name: string; label?: string }) {
  return <Link href={href} aria-label={`${label}: ${name}`} className={cn(btnOutline, 'min-w-10 whitespace-nowrap px-2.5 md:px-3.5')}><span className="max-md:sr-only">{label}</span><ArrowRight aria-hidden className="size-4" /></Link>;
}

export function Panel({ children, className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={cn('rounded-2xl border border-stone-line bg-white', className)}>{children}</section>;
}

// A soft-tinted icon beside a panel heading, so each kind of list reads at a glance (the same pairs as the initials, all at least 7:1).
const TONE = { lilac: 'bg-[#ece6ff] text-[#35197a]', green: 'bg-[#dcf3e7] text-[#174a32]', amber: 'bg-[#f5efd6] text-[#4d3f0a]', peach: 'bg-[#fde9d7] text-[#6b2f0c]', blue: 'bg-[#e3eefb] text-[#173a66]' } as const;
export type Tone = keyof typeof TONE;
export function IconBadge({ icon: Icon, tone }: { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; tone: Tone }) {
  return <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-xl', TONE[tone])}><Icon aria-hidden className="size-5" /></span>;
}
