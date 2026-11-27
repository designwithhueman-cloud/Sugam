// Replays a saved flow in a real browser and records evidence per step. Public pages only, no credentials.
//   - The policy engine (packages/policy-engine) judges every step except the engine's own first page load. It cannot be switched off; the
//     host can only loosen specific rules through `policy`. `beforeStep` runs after it and can only add refusals.
//   - Every goto is checked by the same URL guard the scanner uses, and the browser goes through the scanner's egress proxy.
//   - `fill` refuses password fields even if the policy is loosened (a second layer).
//   - A failed step stops the run; later steps are recorded as skipped.
import { chromium, type Page } from 'playwright';
import { checkUrl } from '../../lib/net/guard.ts';
import { startEgressProxy } from '../../scanner/egress-proxy.ts';
import { createPolicy, type PolicyOptions } from '../policy-engine/index.ts';
import { FlowRun, type Assertion, type AssertionResult, type Flow, type Step, type StepResult } from '../contracts/index.ts';

export type StepDecision = { allow: true } | { allow: false; reason: string };
export type RunOptions = { policy?: Omit<PolicyOptions, 'startUrl'>; beforeStep?: (step: Step, page: Page) => Promise<StepDecision> | StepDecision; stepTimeoutMs?: number; maxMs?: number };   // maxMs: budget for the steps, checked between steps

async function check(page: Page, a: Assertion): Promise<AssertionResult> {
  try {
    if (a.type === 'visible' || a.type === 'hidden') {
      const loc = page.locator(a.selector).first(); const shown = (await loc.count()) > 0 && (await loc.isVisible());
      return { assertion: a, passed: a.type === 'visible' ? shown : !shown, observed: shown ? 'visible' : 'not visible or absent' };
    }
    if (a.type === 'text_contains') {
      const t = ((a.selector ? await page.locator(a.selector).first().innerText({ timeout: 1500 }) : await page.locator('body').innerText()) ?? '').replace(/\s+/g, ' ');
      return { assertion: a, passed: t.toLowerCase().includes(a.text.toLowerCase()), observed: t.slice(0, 160) };
    }
    if (a.type === 'url_contains') { const u = page.url(); return { assertion: a, passed: u.includes(a.value), observed: u.slice(0, 200) }; }
    const t = await page.title(); return { assertion: a, passed: t.toLowerCase().includes(a.value.toLowerCase()), observed: t.slice(0, 200) };
  } catch (e) { return { assertion: a, passed: false, observed: `could not read: ${(e as Error).message.split('\n')[0].slice(0, 120)}` }; }
}

async function perform(page: Page, s: Step, timeout: number): Promise<void> {
  if (s.action === 'goto') { await checkUrl(s.url); const r = await page.goto(s.url, { timeout: 20000, waitUntil: 'load' }); if (r && r.status() >= 400) throw new Error(`The page answered ${r.status()}.`); return; }
  if (s.action === 'click') { const l = page.locator(s.selector).first(); await l.scrollIntoViewIfNeeded({ timeout }); await l.click({ timeout }); return; }
  if (s.action === 'fill') {
    const l = page.locator(s.selector).first(); const type = (await l.getAttribute('type', { timeout }))?.toLowerCase();
    if (type === 'password') throw new BlockedStep('Password fields cannot be filled by a saved flow.');
    await l.fill(s.value, { timeout }); return;
  }
  if (s.action === 'press') { await page.keyboard.press(s.key); return; }
  await page.locator(s.selector).first().waitFor({ state: 'visible', timeout: s.timeoutMs });
}
export class BlockedStep extends Error {}

export async function runFlow(flow: Flow, opts: RunOptions = {}): Promise<FlowRun> {
  const t0 = Date.now(), startedAt = new Date().toISOString(), timeout = opts.stepTimeoutMs ?? 5000, maxMs = opts.maxMs ?? 60000;
  const steps: StepResult[] = []; const consoleErrors: string[] = []; const failedRequests: FlowRun['failedRequests'] = [];
  const done = (status: FlowRun['status']): FlowRun => FlowRun.parse({ flowId: flow.id, status, startedAt, ms: Date.now() - t0, steps, consoleErrors, failedRequests });
  await checkUrl(flow.startUrl);   // refuse a private start address before a browser exists
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--proxy-bypass-list=<-loopback>', '--disable-extensions'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, proxy: { server: proxy.url } }); const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && consoleErrors.length < 50) consoleErrors.push(m.text().slice(0, 300)); });
    page.on('requestfailed', (r) => { if (failedRequests.length < 50) failedRequests.push({ url: r.url().slice(0, 300), status: null, reason: (r.failure()?.errorText ?? 'failed').slice(0, 120) }); });
    page.on('response', (r) => { if (r.status() >= 400 && failedRequests.length < 50) failedRequests.push({ url: r.url().slice(0, 300), status: r.status(), reason: 'HTTP error' }); });
    const stepsStart = Date.now();   // the step budget starts once the browser is up; the worker's hard limit covers launch
    const all: Step[] = [{ id: 'start', action: 'goto', url: flow.startUrl, expect: [] }, ...flow.steps];
    const policy = createPolicy({ ...opts.policy, startUrl: flow.startUrl }); let stopped: 'failed' | 'blocked' | null = null;
    for (const s of all) {
      const ts = Date.now(); const rec = (status: StepResult['status'], error: string | null, assertions: AssertionResult[] = []) => steps.push({ stepId: s.id, action: s.action, status, ms: Date.now() - ts, urlAfter: page.url() === 'about:blank' ? null : page.url(), error, assertions });
      if (stopped) { rec('skipped', null); continue; }
      if (Date.now() - stepsStart > maxMs) { rec('failed', 'The flow ran past its time limit.'); stopped = 'failed'; continue; }
      if (s !== all[0]) {   // the first load is the guarded start address, not a flow step
        const p = await policy(s, page); if (!p.allow) { rec('blocked', p.reason); stopped = 'blocked'; continue; }
        const v = opts.beforeStep ? await opts.beforeStep(s, page) : { allow: true as const }; if (!v.allow) { rec('blocked', v.reason); stopped = 'blocked'; continue; }
      }
      try { await perform(page, s, timeout); } catch (e) {
        if (e instanceof BlockedStep) { rec('blocked', e.message); stopped = 'blocked'; } else { rec('failed', (e as Error).message.split('\n')[0].replace(/^locator\.\w+: /, '').slice(0, 300)); stopped = 'failed'; }
        continue;
      }
      const results: AssertionResult[] = []; for (const a of s.expect) results.push(await check(page, a));
      const bad = results.find((r) => !r.passed);
      if (bad) { rec('failed', `Expected ${bad.assertion.type.replace('_', ' ')} was not true: ${bad.observed}`, results); stopped = 'failed'; } else rec('passed', null, results);
    }
    return done(stopped ?? 'passed');
  } finally { await browser.close().catch(() => {}); await proxy.close().catch(() => {}); }
}
