import Link from 'next/link';

/** Breadcrumb, the page's one H1, and its primary action on the right. */
export function PageHead({ crumbs, current, title, sub, children }: { crumbs: { label: string; href?: string }[]; current: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-1.5 text-sm text-pine-600">
        {crumbs.map((c) => <li key={c.label} className="flex items-center gap-1.5">{c.href ? <Link href={c.href} className="underline-offset-4 hover:text-ink hover:underline">{c.label}</Link> : c.label}<span aria-hidden>/</span></li>)}
        <li aria-current="page" className="font-semibold text-ink">{current}</li>
      </ol></nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0"><h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-ink sm:text-[2.5rem]">{title}</h1>
          {sub && <p className="mt-1 break-all text-[15px] text-pine-600">{sub}</p>}</div>
        {children}
      </div>
    </header>
  );
}
