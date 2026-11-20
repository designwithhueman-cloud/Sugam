import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Resource } from '@/components/landing/Resource.tsx';
import { GUIDES } from '@/lib/guides.ts';

export const metadata = { title: 'Learn | Sugam', description: 'Short, plain-language guides to accessibility for people building websites with AI tools.' };

export default function Page() {
  return (
    <Resource kicker="Learn" title="Accessibility, in plain language" lede="Short guides for people building with AI tools. One idea at a time, no jargon, and no legal advice.">
      <ul className="grid gap-5">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/learn/${g.slug}`} className="group block rounded-[1.75rem] border border-black/10 bg-white p-6 hover:border-black/30">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">{g.title}</h2>
              <p className="mt-2 text-lg leading-relaxed text-neutral-800">{g.summary}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-lg font-semibold text-ink underline underline-offset-4 group-hover:no-underline">Read the guide<ArrowRight aria-hidden className="size-4" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </Resource>
  );
}
