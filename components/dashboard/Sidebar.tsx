'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Table2, ScanSearch, GitCompare, Settings, ChevronsUpDown, LogOut, Globe } from 'lucide-react';
import { logoutAction } from '@/app/actions.ts';
import { cn } from '@/lib/utils.ts';
import { Wordmark } from '@/components/landing/Header.tsx';

type Site = { id: string; name: string; url: string | null; client: string };
export function Sidebar({ org, orgName, sites, user }: { org: string; orgName: string; sites: Site[]; user: { email: string; name: string | null } }) {
  const path = usePathname(); const router = useRouter();
  const m = path.match(/\/projects\/([0-9a-f-]{36})/); const siteId = m?.[1] ?? null;
  const base = siteId ? `/app/${org}/projects/${siteId}` : null;
  const items = [
    { href: base ?? `/app/${org}`, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    ...(base ? [
      { href: `${base}/reports`, label: 'Reports', icon: Table2 },
      { href: `${base}/scanner`, label: 'Accessibility scanner', icon: ScanSearch },
      { href: `${base}/compare`, label: 'Before and after', icon: GitCompare },
    ] : []),
  ];
  const active = (href: string, exact?: boolean) => (exact ? path === href : path.startsWith(href));
  return (
    <aside className="on-dark flex w-full shrink-0 flex-col bg-pine-900 text-pine-100 lg:sticky lg:top-0 lg:h-screen lg:w-72">
      <div className="flex items-center gap-2 px-6 pb-4 pt-6 text-xl font-extrabold text-white">
        <Wordmark onDark className="text-2xl" />
      </div>
      <div className="px-4">
        <label htmlFor="site" className="sr-only">Site</label>
        <div className="relative rounded-xl border border-pine-400/40 bg-white/5">
          <Globe aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pine-300" />
          <select id="site" value={siteId ?? ''} onChange={(e) => router.push(e.target.value ? `/app/${org}/projects/${e.target.value}` : `/app/${org}`)}
            className="h-12 w-full appearance-none rounded-xl bg-transparent pl-9 pr-8 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-300 [&>option]:text-slate-900">
            <option value="">All sites · {orgName}</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.client})</option>)}
          </select>
          <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-pine-300" />
        </div>
      </div>
      <nav aria-label="Dashboard" className="mt-5 flex-1 px-3">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon, exact }) => (
            <li key={label}>
              <Link href={href} aria-current={active(href, exact) ? 'page' : undefined}
                className={cn('flex items-center gap-3 rounded-xl px-3 min-h-11 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-300', active(href, exact) ? 'bg-pine-700 text-white' : 'text-pine-200 hover:bg-white/10 hover:text-white')}>
                <Icon aria-hidden className="size-5" />{label}
              </Link>
            </li>
          ))}
        </ul>
        {!siteId && sites.length > 0 && <p className="mt-4 px-3 text-xs text-pine-300">Pick a site above to see its reports and scanner.</p>}
      </nav>
      <div className="space-y-1 border-t border-white/10 p-3">
        <Link href={`/app/${org}/settings`} aria-current={path.startsWith(`/app/${org}/settings`) ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-xl px-3 min-h-11 py-2.5 text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-300', path.startsWith(`/app/${org}/settings`) ? 'bg-pine-700 text-white' : 'text-pine-200')}><Settings aria-hidden className="size-5" />Workspace settings</Link>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-white">{user.name || 'Account'}</p><p className="truncate text-xs text-pine-300">{user.email}</p></div>
          <form action={logoutAction}><button className="rounded-lg p-2 text-pine-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-300" aria-label="Sign out"><LogOut aria-hidden className="size-4" /></button></form>
        </div>
        <Link href="/app" className="block px-3 py-1 text-xs text-pine-300 underline underline-offset-2 hover:text-white">Switch workspace</Link>
      </div>
    </aside>
  );
}
