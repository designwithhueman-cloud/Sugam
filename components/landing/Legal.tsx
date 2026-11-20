// Plain-language legal pages share this layout.
export function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main id="main" className="px-5 pb-20 pt-12 sm:px-10 sm:pt-16">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl">{title}</h1>
        <p className="mt-4 text-base text-neutral-700">Last updated {updated}</p>
        <div className="mt-10 space-y-10 text-lg leading-relaxed text-neutral-800">{children}</div>
      </article>
    </main>
  );
}
export const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 text-2xl font-semibold tracking-tight text-ink">{children}</h2>;
export const UL = ({ items }: { items: React.ReactNode[] }) => <ul className="list-disc space-y-2 pl-6">{items.map((i, n) => <li key={n}>{i}</li>)}</ul>;
