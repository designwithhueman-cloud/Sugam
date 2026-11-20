'use client';
import * as React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { logoutAction } from '@/app/actions.ts';
import { NAV, type NavLinks } from './nav.ts';

const item = 'inline-flex min-h-11 items-center rounded-full px-4 text-base font-medium text-ink hover:bg-black/5';

// Wordmark: the name between lime corner brackets, like a viewfinder.
export function Wordmark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`relative inline-flex items-center px-3.5 py-1 text-[1.7rem] font-semibold leading-none tracking-tight ${onDark ? 'text-white' : 'text-ink'} ${className}`}>
      <span aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute left-0 top-0 h-3 w-3 rounded-tl-md border-l-[3px] border-t-[3px] border-[#a8e12a]" />
        <span className="absolute right-0 top-0 h-3 w-3 rounded-tr-md border-r-[3px] border-t-[3px] border-[#a8e12a]" />
        <span className="absolute bottom-0 left-0 h-3 w-3 rounded-bl-md border-b-[3px] border-l-[3px] border-[#a8e12a]" />
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-br-md border-b-[3px] border-r-[3px] border-[#a8e12a]" />
      </span>
      <span className="relative">Sugam</span>
    </span>
  );
}

export function LandingHeader({ signedIn, nav = NAV }: { signedIn: boolean; nav?: NavLinks }) {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-warm/95 px-5 py-3 backdrop-blur sm:px-10 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" aria-label="Sugam home" className="inline-flex min-h-11 items-center rounded-lg"><Wordmark /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">{nav.map(([l, h]) => <a key={h} href={h} className={item}>{l}</a>)}</nav>
        <div className="flex items-center gap-1">
          {signedIn ? (
            <>
              <form action={logoutAction} className="hidden sm:block"><button className={item}>Sign out</button></form>
              <Link href="/app" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-4 text-base sm:px-5 font-medium text-ink hover:bg-black/5">Dashboard</Link>
            </>
          ) : <><Link href="/website-accessibility-checker" className="hidden min-h-11 items-center whitespace-nowrap rounded-full bg-ink px-5 text-base font-medium text-white hover:bg-neutral-800 sm:inline-flex">Scan free</Link><Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-4 text-base sm:px-5 font-medium text-ink hover:bg-black/5">Sign in</Link></>}
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
