// Avara Launch Scanner (vendor/avara-launch): nine DIFF reviews and seven launch adapters, run once per viewport on the page this scan
// already opened and settled, in its initial state (after axe, before the keyboard trace or any click). The pack is loaded at run time
// from its own folder, unchanged, so its snapshot and browser tests keep testing the code that runs here. It opens no URLs, submits
// nothing, calls no model and writes nothing; its raw capture stays inside this function and only its result rows are kept.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import type { AxeResults } from 'axe-core';
import type { ActionProbe } from './avara.ts';

export type PackStatus = 'observed' | 'needs-review' | 'needs-person' | 'not-applicable' | 'not-run' | 'analyzer-finding';
export type PackRow = { ruleId: string; version: string; detectorId?: string; status: PackStatus; reason: string; evidence: unknown[]; weight: 0; scoreEligible: false; referenceMatch?: boolean };
export type Goal = { text: string; selectors: string[]; alternatives: string[] };
export type LaunchResult = { viewport: [number, number] | null; diagnostics: { stage: string; reason: string }[]; rows: PackRow[]; pattern: unknown; ms: number; goal: Goal | null; error?: string };

type Pack = { inspectPage: (page: Page, options: Record<string, unknown>) => Promise<Omit<LaunchResult, 'ms' | 'goal'>> };
let pack: Promise<Pack> | null = null;
// A runtime path, not a bundled import: the pack reads its JSON next to itself (import.meta.url), which only works when Node loads it.
const load = () => (pack ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pathToFileURL(path.join(process.cwd(), 'vendor', 'avara-launch', 'scanner.mjs')).href) as Promise<Pack>);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Every element on this viewport that is the same action as the main one (same visible label), so a desktop copy hidden on a phone and
 *  the phone's own equivalent are judged together. The pack keeps only the visible ones. */
export function goalSelectors(probe: ActionProbe | null, goalText: string | null): Goal | null {
  const main = probe?.candidates[0]?.candidate; const text = (goalText || main?.text || '').trim();
  if (!probe || !text) return null;
  const all = probe.candidates.map((c) => c.candidate);
  const same = all.filter((c) => norm(c.text) === norm(text)).map((c) => c.selector);
  // The competing actions for DIFF-007 are the probe's other ranked candidates (a different label), at most six.
  const alternatives = [...new Set(all.filter((c) => c.text.trim() && norm(c.text) !== norm(text)).map((c) => c.selector))].slice(0, 6);
  return same.length ? { text, selectors: [...new Set(same)], alternatives } : null;
}

export async function runLaunchPack(page: Page, input: { axe: AxeResults; probe: ActionProbe | null; goal: string | null; pageId: string }): Promise<LaunchResult | null> {
  const t0 = Date.now(); const goal = goalSelectors(input.probe, input.goal);
  // Turned off: recorded as a reason on every viewport, so the report says why the checks are missing instead of showing nothing.
  if (process.env.AVARA_LAUNCH === 'off') return { viewport: null, diagnostics: [], rows: [], pattern: null, ms: 0, goal, error: 'turned off on this server (AVARA_LAUNCH=off)' };
  try {
    const { inspectPage } = await load();
    // No references, brand brief or section mapping exist yet: the production reference set starts empty, so the checks that need them
    // stay undecided with the pack's own reason. A brief or references, when an owner supplies them, are passed here.
    const r = await inspectPage(page, { pageId: input.pageId, axe: input.axe, references: [], mapping: { goal: goal?.selectors.join(', ') || undefined, alternative: goal?.alternatives.join(', ') || undefined } });
    return { ...r, ms: Date.now() - t0, goal };
  } catch (e) {
    return { viewport: null, diagnostics: [{ stage: 'load', reason: 'The launch checks could not run' }], rows: [], pattern: null, ms: Date.now() - t0, goal, error: (e as Error).message.split('\n')[0].slice(0, 160) };
  }
}
