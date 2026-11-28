import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Resource } from '@/components/landing/Resource.tsx';
import { GUIDES, guideBySlug } from '@/lib/guides.ts';

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug); return g ? { title: `${g.title} | Avara`, description: g.summary } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug); if (!g) notFound();
  return (
    <Resource kicker="Guide" title={g.title} lede={g.intro}>
      <div className="space-y-10">
        {g.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{s.h}</h2>
            {s.p?.map((t) => <p key={t} className="mt-3 text-lg leading-relaxed text-neutral-800">{t}</p>)}
            {s.list && <ul className="mt-3 list-disc space-y-2 pl-6 text-lg leading-relaxed text-neutral-800">{s.list.map((t) => <li key={t}>{t}</li>)}</ul>}
          </section>
        ))}
      </div>
      <p className="mt-12 text-lg text-neutral-800">More guides: <Link href="/learn" className="font-semibold text-ink underline underline-offset-4">all guides</Link>.</p>
    </Resource>
  );
}
