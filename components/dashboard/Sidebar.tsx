'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Layers, BarChart3, Lock, Settings, ChevronDown, LogOut, Menu, X, Check, Plus, Table2, ScanSearch, GitCompare, LayoutDashboard } from 'lucide-react';
import { logoutAction } from '@/app/actions.ts';
import { cn } from '@/lib/utils.ts';
import { Wordmark } from '@/components/landing/Header.tsx';
import { initials } from '@/components/dashboard/bits.tsx';

type Site = { id: string; name: string; url: string | null; client: string };
type Workspace = { slug: string; name: string };
type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; on: boolean; sub?: boolean };

const itemCls = (on: boolean, sub = false) => cn(
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors',
  sub && 'min-h-10 pl-11 text-sm',
  on ? 'bg-[#ece6ff] font-semibold text-[#2a1470]' : 'text-pine-700 hover:bg-pine-100 hover:text-ink',
);

export function Sidebar({ org, orgName, planName, workspaces, sites, user }: { org: string; orgName: string; planName: string; workspaces: Workspace[]; sites: Site[]; user: { email: string; name: string | null } }) {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  const switcher = React.useRef<HTMLDetailsElement>(null);
  // Close the phone menu and the workspace list after every navigation.
  React.useEffect(() => { setOpen(false); switcher.current?.removeAttribute('open'); }, [path]);

  const root = `/app/${org}`;
  const siteId = path.match(/\/projects\/([0-9a-f-]{36})/)?.[1] ?? null;
  const site = siteId ? sites.find((s) => s.id === siteId) : null;
  const pb = siteId ? `${root}/projects/${siteId}` : '';
  const workspace: Item[] = [
    { href: root, label: 'Overview', icon: Home, on: path === root },
    { href: `${root}/projects`, label: 'Client projects', icon: Layers, on: path === `${root}/projects` },
  ];
  const project: Item[] = site ? [
    { href: pb, label: 'Project overview', icon: LayoutDashboard, on: path === pb, sub: true },
    { href: `${pb}/reports`, label: 'Reports', icon: Table2, on: path.startsWith(`${pb}/reports`), sub: true },
    { href: `${pb}/scanner`, label: 'Scanner', icon: ScanSearch, on: path.startsWith(`${pb}/scanner`), sub: true },
    { href: `${pb}/compare`, label: 'Before and after', icon: GitCompare, on: path.startsWith(`${pb}/compare`), sub: true },
  ] : [];
  const shared: Item = { href: `${root}/shared`, label: 'Shared reports', icon: BarChart3, on: path.startsWith(`${root}/shared`) };
  const personal: Item = { href: `${root}/quick-scans`, label: 'Quick scans', icon: Lock, on: path.startsWith(`${root}/quick-scans`) };
  const settingsOn = path.startsWith(`${root}/settings`);
  const link = (i: Item) => (
    <li key={i.href}>
      <Link href={i.href} aria-current={i.on ? 'page' : undefined} className={itemCls(i.on, i.sub)}>
        {!i.sub && <i.icon aria-hidden className="size-5 shrink-0" />}{i.label}
      </Link>
    </li>
  );

  return (
    <aside className="w-full shrink-0 border-b border-stone-line bg-[#f7f6f2] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[17rem] lg:flex-col lg:border-b-0 lg:border-r">
      {/* Phone and tablet: a slim bar with the menu button */}
      <div className="flex items-center justify-between px-4 py-3 lg:hidden">
        <Link href={root} className="rounded-lg"><Wordmark className="text-[1.4rem]" /><span className="sr-only">: {orgName} overview</span></Link>
        <button type="button" aria-expanded={open} aria-controls="app-nav" onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-pine-300 bg-white px-3.5 text-sm font-semibold text-ink">
          {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}Menu
        </button>
      </div>

      <div id="app-nav" className={cn('flex-col px-4 pb-4 lg:flex lg:h-full lg:pb-5 lg:pt-6', open ? 'flex' : 'hidden')}>
        <Link href={root} className="mb-6 hidden self-start rounded-lg lg:block"><Wordmark className="text-[1.6rem]" /><span className="sr-only">: {orgName} overview</span></Link>

        <details ref={switcher} className="group relative">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl border border-pine-300 bg-white px-3 text-left hover:border-pine-500 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1"><span className="sr-only">Workspace: </span><span className="block truncate text-[15px] font-semibold text-ink">{orgName}</span><span className="block text-xs text-pine-600">{planName}</span></span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-pine-600 transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 rounded-xl border border-stone-line bg-white p-1.5 shadow-[0_16px_40px_-16px_rgba(17,17,17,.25)]">
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-pine-600">Switch workspace</p>
            <ul>
              {workspaces.map((w) => (
                <li key={w.slug}><Link href={`/app/${w.slug}`} aria-current={w.slug === org ? 'true' : undefined} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm text-ink hover:bg-pine-100">
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>{w.slug === org && <Check aria-hidden className="size-4 text-vio" />}
                </Link></li>
              ))}
            </ul>
            <Link href="/app?new=workspace" className="mt-1 flex min-h-10 items-center gap-2 rounded-lg border-t border-stone-line px-2.5 pt-1 text-sm font-semibold text-ink hover:bg-pine-100"><Plus aria-hidden className="size-4" />New workspace</Link>
          </div>
        </details>

        <nav aria-label="Workspace" className="mt-5">
          <ul className="space-y-0.5">
            {workspace.map(link)}
            {site && (
              <li>
                <p className="flex min-h-10 items-center pl-11 pr-3 pt-1 text-xs font-semibold text-pine-600"><span className="truncate">{site.name}</span></p>
                <ul className="space-y-0.5">{project.map(link)}</ul>
              </li>
            )}
            {link(shared)}
          </ul>
        </nav>

        <div className="my-5 border-t border-stone-line" />
        <nav aria-labelledby="nav-personal">
          <p id="nav-personal" className="px-3 pb-1.5 text-[13px] font-medium text-pine-600">Personal</p>
          <ul>{link(personal)}</ul>
        </nav>

        <div className="mt-6 border-t border-stone-line pt-4 lg:mt-auto">
          <Link href={`${root}/settings`} aria-current={settingsOn ? 'page' : undefined} className={itemCls(settingsOn)}><Settings aria-hidden className="size-5 shrink-0" />Workspace settings</Link>
          <div className="mt-2 flex items-center gap-3 px-1.5">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#ece6ff] text-[13px] font-semibold text-[#35197a]">{initials(user.name || user.email)}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{user.name || 'Your account'}</p><p className="truncate text-xs text-pine-600">{user.email}</p></div>
            <form action={logoutAction}><button className="grid size-10 place-items-center rounded-lg text-pine-600 hover:bg-pine-100 hover:text-ink" aria-label="Sign out"><LogOut aria-hidden className="size-4" /></button></form>
          </div>
        </div>
      </div>
    </aside>
  );
}
