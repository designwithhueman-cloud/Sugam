// Avara's main-action checks, run on one page at one screen size: find the likely main action, measure whether a visitor can really use
// it, then (on request) activate it and see what happens, stopping before anything is submitted. Each result is evidence for a finding;
// nothing here decides what to fix first (that is analysis/avara/).
import type { Page } from 'playwright';
import { FIND_ACTIONS, MEASURE_ACTION, FIELDS_SNAPSHOT, REACH_FIELD } from './avara-inpage.ts';
import { collapsedContainer, collapsedNote } from '../lib/avara/evidence-check.ts';
import { CODE_EVIDENCE } from './code-evidence.ts';

export type Measurement = {
  found: boolean; selector: string; text: string; html: string; tag: string; rendered: boolean; pointerEventsNone: boolean; disabled: boolean;
  box: { x: number; y: number; width: number; height: number }; width: number; height: number; belowFirstScreen: boolean; outsideX: boolean;
  sidewaysScrollPossible: boolean; xOverflowHidden: boolean; pageWidth: number; viewportWidth: number; visibleRatio: number; clippedBy: string | null;
  covered: boolean; cover: { selector: string; position: string; text: string; dismissible?: boolean; box?: { x: number; y: number; width: number; height: number } } | null; centerPoint: { x: number; y: number };
  /** Code evidence for the fix, read in the same state (scanner/code-evidence.ts): keys action, cover, clippedBy. */
  code?: Record<string, import('./code-evidence.ts').CodeEvidence> | null;
};
export type Classification = { level: 'ok' | 'inconvenient' | 'unusable'; unproven?: string; reasons: string[]; causes: { kind: 'hidden' | 'clipped' | 'covered' | 'offscreen' | 'small' | 'sideways' | 'ignored'; detail: string }[] };
export type Candidate = { selector: string; text: string; how: 'goal' | 'inferred'; score: number; tag: string; html: string; submits: boolean; formSelector: string | null; href: string; external: boolean; mail: boolean };
export type WorkflowOutcome = 'form_reached' | 'form_not_reached' | 'no_visible_change' | 'navigated_no_form' | 'not_activated' | 'could_not_activate';
export type Workflow = { outcome: WorkflowOutcome; reason: string; steps: string[]; coverage: string; firstField?: { selector: string; name: string }; reach?: Record<string, unknown> };
export type ActionProbe = { viewport: 'desktop' | 'mobile'; width: number; goal: string | null; candidates: { candidate: Candidate; measurement: Measurement | null; classification: Classification | null }[]; workflow: Workflow | null };

// Tell "inconvenient" (a visitor can still do it) from "cannot use" (a visitor cannot).
export function classify(m: Measurement): Classification {
  const causes: Classification['causes'] = [];
  const cannot: string[] = [], hard: string[] = [];
  const add = (list: string[], kind: Classification['causes'][number]['kind'], text: string) => { list.push(text); causes.push({ kind, detail: text }); };
  if (!m.rendered) add(cannot, 'hidden', 'It is not shown at this width.');
  if (m.pointerEventsNone) add(cannot, 'ignored', 'It ignores taps (pointer-events: none).');
  if (m.rendered && m.visibleRatio < 0.2) add(cannot, m.clippedBy ? 'clipped' : 'offscreen', m.clippedBy ? `Most of it is cut off by ${m.clippedBy}.` : `Most of it is outside the ${m.viewportWidth}px screen.`);
  // A cookie/consent banner the visitor can dismiss is not a defect of this element: the banner is reported on its own, and blaming the link would be a false alarm.
  if (m.rendered && m.covered && m.cover && !m.cover.dismissible) add(cannot, 'covered', `${m.cover.selector} (${m.cover.position}) covers the middle of it, so a tap lands there instead.`);
  if (m.rendered && m.outsideX && !m.sidewaysScrollPossible && m.visibleRatio < 0.5) add(cannot, 'offscreen', 'It runs past the screen edge and the page cannot scroll sideways to reach it.');
  if (!cannot.length) {
    if (m.visibleRatio >= 0.2 && m.visibleRatio < 0.9) add(hard, 'clipped', `Part of it is cut off (${Math.round(m.visibleRatio * 100)}% visible).`);
    if (m.outsideX && m.sidewaysScrollPossible) add(hard, 'sideways', 'Reaching it needs sideways scrolling.');
    if (m.rendered && (m.width < 24 || m.height < 24)) add(hard, 'small', `It is only ${m.width} by ${m.height} px; the minimum target is 24 by 24 px.`);
  }
  const box = collapsedContainer(m);
  return { level: cannot.length ? 'unusable' : hard.length ? 'inconvenient' : 'ok', ...(box && cannot.length ? { unproven: collapsedNote(box) } : {}), reasons: [...cannot, ...hard], causes };
}

const REACH_LIMIT = 'Stopped before submission. Not covered: field validation, the confirmation step, and whether the sign-up is received.';

async function reach(page: Page, selector: string) { return (await page.evaluate(`(${REACH_FIELD})(${JSON.stringify(selector)})`)) as { found: boolean; shown?: boolean; inView?: boolean; covered?: boolean; cover?: { selector: string; position: string } | null; focused?: boolean; inert?: boolean; size?: { w: number; h: number } }; }
const reachFailure = (r: Awaited<ReturnType<typeof reach>>) => (!r.found ? 'The field is no longer on the page.' : !r.shown ? 'The field is not visible.' : r.covered && r.cover ? `${r.cover.selector} (${r.cover.position}) covers the field.` : r.inert ? 'The field is inert.' : !r.focused ? 'The field cannot take focus.' : !r.inView ? 'The field is outside the screen.' : '');

// Activate the action and watch what a visitor would see. Never submits a form: a submit button is not clicked, the form's first field is checked instead.
export async function runWorkflow(page: Page, cand: Candidate, cls: Classification | null): Promise<Workflow> {
  const steps: string[] = [`Found the main action: “${cand.text}” (${cand.how === 'goal' ? 'matches the goal you confirmed' : 'chosen by Avara from the page'}).`];
  if (cls?.unproven) return { outcome: 'not_activated', reason: cls.unproven, steps: [...steps, `Not activated: ${cls.unproven}`], coverage: 'Ends before activation: the action was inside a collapsed container that Avara did not open.' };
  if (cls?.level === 'unusable') return { outcome: 'could_not_activate', reason: cls.reasons[0], steps: [...steps, `A visitor could not activate it: ${cls.reasons[0]}`], coverage: 'Ends before activation: the action cannot be used at this width.' };
  if (cand.mail) return { outcome: 'not_activated', reason: 'The action opens an email or phone app.', steps: [...steps, 'It is a mailto or tel link, so Avara did not activate it.'], coverage: 'Ends at the link: Sugam does not open email or phone apps.' };
  // A download link does what a visitor expects when it downloads: there is no form or dialog to reach, so it is never judged as broken.
  if (/\sdownload(?=[\s=>])/i.test(cand.html ?? '') || /\.(pdf|zip|docx?|pptx?|xlsx?|csv|dmg|exe|pkg|epub)(?:[?#]|$)/i.test(cand.href ?? '')) return { outcome: 'not_activated', reason: 'The action downloads a file.', steps: [...steps, 'It downloads a file, so Avara did not look for a form after it.'], coverage: 'Ends at the download: a download has no form to reach.' };
  if (cand.external) return { outcome: 'not_activated', reason: 'The action goes to another website.', steps: [...steps, `It links to another site (${new URL(cand.href).host}), so Avara did not follow it.`], coverage: 'Ends at the link: Sugam reviews one site at a time.' };
  const before = (await page.evaluate(`(${FIELDS_SNAPSHOT})(${JSON.stringify(cand.submits ? cand.formSelector : null)})`)) as { url: string; fields: { selector: string; name: string }[]; dialogs: { label: string }[] };
  if (cand.submits) {
    steps.push('The action submits a form on the page, so Avara did not click it.');
    const first = before.fields[0];
    if (!first) return { outcome: 'no_visible_change', reason: 'The form has no visible field.', steps: [...steps, 'The form has no visible field to fill in.'], coverage: REACH_LIMIT };
    const r = await reach(page, first.selector); const why = reachFailure(r);
    steps.push(why ? `Tried to reach the first field (${first.name || first.selector}): ${why}` : `The first field (${first.name || first.selector}) is visible, not covered, and takes focus.`);
    return { outcome: why ? 'form_not_reached' : 'form_reached', reason: why || 'The first field is reachable.', steps, coverage: REACH_LIMIT, firstField: first, reach: r };
  }
  try {
    const loc = page.locator(cand.selector).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
    const popup = page.context().waitForEvent('page', { timeout: 1500 }).catch(() => null);
    await loc.click({ timeout: 4000 });
    steps.push(`Activated “${cand.text}”.`);
    const opened = await popup; if (opened) { steps.push('It opened a new tab.'); await opened.close().catch(() => {}); }
  } catch (e) {
    const msg = (e as Error).message.split('\n')[0].replace(/^locator\.click: /, '').slice(0, 160);
    return { outcome: 'could_not_activate', reason: msg, steps: [...steps, `Could not activate it: ${msg}`], coverage: 'Ends before activation.' };
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(900);
  const after = (await page.evaluate(`(${FIELDS_SNAPSHOT})(null)`)) as { url: string; hash: string; fields: { selector: string; name: string }[]; dialogs: { label: string }[] };
  const urlChanged = after.url.split('#')[0] !== before.url.split('#')[0];
  const newFields = after.fields.filter((f) => !before.fields.some((b) => b.selector === f.selector));
  const fields = newFields.length ? newFields : urlChanged ? after.fields : [];
  if (after.dialogs.length > before.dialogs.length) steps.push(`A dialog opened${after.dialogs[0]?.label ? `: “${after.dialogs[0].label}”` : ''}.`);
  if (urlChanged) steps.push(`The page moved to ${new URL(after.url).pathname}.`);
  if (!fields.length) {
    if (!urlChanged && after.dialogs.length <= before.dialogs.length && after.hash === (before as { hash?: string }).hash) return { outcome: 'no_visible_change', reason: 'Nothing visible changed after activating it.', steps: [...steps, 'Nothing visible changed: no new field, dialog or page.'], coverage: REACH_LIMIT };
    return { outcome: 'navigated_no_form', reason: 'No form field appeared.', steps: [...steps, 'No form field appeared.'], coverage: 'Ends here: no form was found to check.' };
  }
  const first = fields[0]; steps.push(`A form appeared; its first field is “${first.name || first.selector}”.`);
  const r = await reach(page, first.selector); const why = reachFailure(r);
  steps.push(why ? `Tried to reach the first field: ${why}` : 'The first field is visible, not covered, and takes focus.');
  return { outcome: why ? 'form_not_reached' : 'form_reached', reason: why || 'The first field is reachable.', steps, coverage: REACH_LIMIT, firstField: first, reach: r };
}

export async function probeActions(page: Page, vp: 'desktop' | 'mobile', width: number, goal: string | null, withWorkflow: boolean): Promise<ActionProbe> {
  const found = (await page.evaluate(`(${FIND_ACTIONS})(${JSON.stringify(goal)})`)) as { candidates: Candidate[] };
  const candidates: ActionProbe['candidates'] = [];
  // The action the builder named comes first, however prominent other buttons are; the rest keep their order.
  const ordered = [...found.candidates.filter((c) => c.how === 'goal'), ...found.candidates.filter((c) => c.how !== 'goal')];
  for (const c of ordered) {
    await page.evaluate(`window.__avaraCodeEvidence = ${CODE_EVIDENCE}`).catch(() => {});   // read by MEASURE_ACTION on the elements it measures
    const m = (await page.evaluate(`(${MEASURE_ACTION})(${JSON.stringify(c.selector)}, ${JSON.stringify(c.text)})`).catch(() => null)) as Measurement | { found: false } | null;
    const measurement = m && m.found ? (m as Measurement) : null;
    candidates.push({ candidate: c, measurement, classification: measurement ? classify(measurement) : null });
  }
  let workflow: Workflow | null = null;
  if (withWorkflow && candidates[0]) {
    const c = candidates[0];
    try { workflow = await runWorkflow(page, c.candidate, c.classification); }
    catch (e) { workflow = { outcome: 'not_activated', reason: `The workflow check failed: ${(e as Error).message.split('\n')[0]}`, steps: ['The workflow check did not complete.'], coverage: 'Did not complete.' }; }
  }
  return { viewport: vp, width, goal, candidates, workflow };
}
