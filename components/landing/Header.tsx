'use client';
import * as React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { logoutAction } from '@/app/actions.ts';
import { NAV, type NavLinks } from './nav.ts';

const item = 'inline-flex min-h-11 items-center rounded-xl px-4 text-base font-medium text-ink hover:bg-black/5';

// AVARA logo: the mark (two corner brackets framing a lime square, like a viewfinder on one part of a page) and the name
// as real text, so it stays sharp and is read as "Avara". Sized in em: set the font size with className to scale it.
export function LogoMark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  const ink = onDark ? '#ffffff' : '#111111';
  return (
    // Brand mark, measured from the master artwork: two corner brackets and the lime square, as tall as the AVARA capitals.
    <svg aria-hidden viewBox="0 0 286 296" className={`h-[0.74em] w-[0.715em] shrink-0 ${className}`}>
      <path fill={ink} d="M0 0H141V44H42V143H0Z" />
      <rect fill="#aacb03" x="69" y="72" width="146" height="152" />
      <path fill={ink} d="M286 296H138V252H242V145H286Z" />
    </svg>
  );
}

export function Wordmark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-[0.24em] text-[1.7rem] font-extrabold leading-none tracking-[-0.01em] ${onDark ? 'text-white' : 'text-ink'} ${className}`}>
      <LogoMark onDark={onDark} />
      <span aria-hidden>AVARA</span><span className="sr-only">Avara</span>
    </span>
  );
}

export function LandingHeader({ signedIn, nav = NAV }: { signedIn: boolean; nav?: NavLinks }) {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-warm/95 px-5 py-3 backdrop-blur sm:px-10 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="Avara home" className="inline-flex min-h-11 items-center rounded-lg"><Wordmark /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">{nav.map(([l, h]) => <a key={h} href={h} className={item}>{l}</a>)}</nav>
        <div className="flex items-center gap-1">
          {signedIn ? (
            <>
              <form action={logoutAction} className="hidden sm:block"><button className={item}>Sign out</button></form>
              <Link href="/app" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border border-ink px-4 text-base sm:px-5 font-medium text-ink hover:bg-black/5">Dashboard</Link>
            </>
          ) : <><Link href="/website-accessibility-checker" className="hidden min-h-11 items-center whitespace-nowrap rounded-xl bg-ink px-5 text-base font-medium text-white hover:bg-neutral-800 sm:inline-flex">Scan free</Link><Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border border-ink px-4 text-base sm:px-5 font-medium text-ink hover:bg-black/5">Sign in</Link></>}
          <button type="button" aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(!open)} className="grid size-11 place-items-center rounded-full text-ink hover:bg-black/5 lg:hidden">
            {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}<span className="sr-only">Menu</span>
          </button>
        </div>
      </div>
      <nav id="landing-menu" aria-label="Main" hidden={!open} className="mt-3 rounded-2xl border border-black/10 bg-white p-2 lg:hidden">
        <ul>
          {nav.map(([l, h]) => <li key={h}><a href={h} onClick={() => setOpen(false)} className={`${item} w-full rounded-xl`}>{l}</a></li>)}
          {!signedIn && <li className="sm:hidden"><a href="/website-accessibility-checker" onClick={() => setOpen(false)} className={`${item} w-full rounded-xl font-semibold`}>Scan free</a></li>}
          {signedIn && <li><form action={logoutAction}><button className={`${item} w-full rounded-xl`}>Sign out</button></form></li>}
        </ul>
      </nav>
    </header>
  );
}
