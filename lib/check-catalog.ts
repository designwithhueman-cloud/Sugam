// What every scan checks, from the rule library: the four questions on the home page, their two areas each, and every check in an area grouped
// by how it is answered. Server only (reads the rule files); the page passes the result to the client explorer as plain data.
import { ruleLoader } from '../src/engines/rule-engine/RuleLoader.ts';
import type { Rule } from '../src/engines/rule-engine/RuleTypes.ts';

export type How = 'measured' | 'ai' | 'person' | 'soon';
export type Area = { name: string; label: string; about: string; checks: { title: string; how: How }[] };
export type Question = { id: string; q: string; why: string; scene: 'Offer' | 'Action' | 'Everyone' | 'Ready'; tint: string; accent: string; areas: Area[] };
export type Catalog = { questions: Question[]; extra: Area | null; total: number; measured: number; areas: number };

const howOf = (r: Rule): How | null => {
  const e = r.evaluator; const dets = e && 'detectors' in e ? e.detectors ?? [] : [];
  if (!e || e.type === 'rollup' || r.mode === 'R') return null;           // summaries of other checks, not checks of their own
  if (e.type === 'human') return 'person';
  return dets.length ? 'measured' : e.type === 'llm' ? 'ai' : 'soon';
};
const AREA: Record<string, [string, string]> = {
  'Product Clarity': ['Product clarity', 'Can a first-time visitor tell what you do, who it is for and why it matters?'],
  'Trust & Credibility': ['Trust', 'Proof that you are real: contact details, policies, reviews and claims backed by numbers.'],
  'UX & Workflow Quality': ['UX and workflow', 'Is the path from landing to your main action clear, short and forgiving?'],
  'Conversion Readiness': ['Conversion', 'Are the offer, the price and the next step easy to act on?'],
  'Mobile Responsiveness': ['Mobile', 'Does the page work at 320px wide, with nothing cut off, covered or too small to tap?'],
  'Accessibility': ['Accessibility', 'WCAG 2.2 AA rules from axe-core, plus keyboard, focus, names and contrast.'],
  'Performance': ['Performance', 'Loading speed on a phone: largest paint, layout shift, heavy scripts and images.'],
  'Design & Brand Quality': ['Design', 'Consistent type, colour, spacing and hierarchy, so the page feels finished.'],
  'Differentiation & Design Maturity': ['Differentiation', 'Does the page read like a stock AI template? Shown as observations, never scored.'],
};
const DEF: (Omit<Question, 'areas'> & { cats: string[] })[] = [
  { id: 'offer', q: 'Is the offer clear?', why: 'A first-time visitor can’t tell what you do or why to trust you, so they leave.', scene: 'Offer', tint: 'bg-[#efe9ff]', accent: '#5b2fd0', cats: ['Product Clarity', 'Trust & Credibility'] },
  { id: 'action', q: 'Can visitors take action?', why: 'The main button is hard to find or competes with others, so visitors give up.', scene: 'Action', tint: 'bg-[#fbe9df]', accent: '#b3501e', cats: ['UX & Workflow Quality', 'Conversion Readiness'] },
  { id: 'everyone', q: 'Can everyone use it?', why: 'Faint text, unnamed buttons or no keyboard access shut people out before they start.', scene: 'Everyone', tint: 'bg-[#eef8cf]', accent: '#4a6b00', cats: ['Mobile Responsiveness', 'Accessibility'] },
  { id: 'ready', q: 'Does the page feel ready?', why: 'A slow, jumpy or unfinished-looking page makes visitors doubt you and leave.', scene: 'Ready', tint: 'bg-[#efe9ff]', accent: '#5b2fd0', cats: ['Performance', 'Design & Brand Quality'] },
];

export function checkCatalog(): Catalog {
  const rules = ruleLoader().loadAllRules().filter((r) => (r as { enabled?: boolean }).enabled !== false);
  const area = (cat: string): Area => ({ name: cat, label: AREA[cat]?.[0] ?? cat, about: AREA[cat]?.[1] ?? '',
    checks: rules.filter((r) => r.category === cat).map((r) => ({ title: r.title, how: howOf(r) })).filter((c): c is { title: string; how: How } => !!c.how) });
  const questions = DEF.map(({ cats, ...q }) => ({ ...q, areas: cats.map(area) }));
  const extra = area('Differentiation & Design Maturity');
  const all = [...questions.flatMap((q) => q.areas), extra];
  return { questions, extra: extra.checks.length ? extra : null, total: all.reduce((n, a) => n + a.checks.length, 0), measured: all.reduce((n, a) => n + a.checks.filter((c) => c.how === 'measured').length, 0), areas: questions.reduce((n, q) => n + q.areas.length, 0) };
}
