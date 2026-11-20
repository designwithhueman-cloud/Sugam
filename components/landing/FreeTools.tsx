// Free tools and guides: the things a visitor can use without scanning or signing up. Server-rendered.
import Link from 'next/link';
import { ArrowRight, BookOpen, Contrast, Wand2 } from 'lucide-react';

const TOOLS = [
  { icon: Wand2, name: 'Rules for your AI builder', text: 'A short rules file to paste into your project, so every new page starts accessible.', href: '/tools/ai-builder-rules', cta: 'Get the rules' },
  { icon: Contrast, name: 'Contrast checker', text: 'Check a text and background colour, and get the closest colour that passes.', href: '/tools/contrast-checker', cta: 'Check colours' },
  { icon: BookOpen, name: 'Plain-language guides', text: 'WCAG, keyboard use, alt text and more, one idea at a time.', href: '/learn', cta: 'Read the guides' },
] as const;

export function FreeTools() {
  return (
    <ul className="grid gap-6 lg:grid-cols-3 lg:gap-8">
      {TOOLS.map((t) => (
        <li key={t.name} className="flex flex-col rounded-[2rem] border border-black/10 bg-white p-8">
          <span aria-hidden className="grid size-16 place-items-center rounded-full bg-[#d9f56e] text-ink"><t.icon className="size-7" /></span>
          <h3 className="mt-10 text-2xl font-semibold leading-tight tracking-tight text-ink">{t.name}</h3>
          <p className="mt-3 flex-1 text-lg leading-relaxed text-neutral-800">{t.text}</p>
          <Link href={t.href} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start text-lg font-semibold text-ink underline underline-offset-4 hover:no-underline">{t.cta}<ArrowRight aria-hidden className="size-4" /></Link>
        </li>
      ))}
    </ul>
  );
}
