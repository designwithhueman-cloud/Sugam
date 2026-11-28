// Finds candidate journeys from one address, in the isolated browser worker. Bounded and read-only: same origin only, links only (no forms, no
// buttons, no sign-in), the same safety rules as a saved flow, the same URL guard and egress proxy as the scanner. The rules live in ./journeys.ts.
import { chromium, type Page } from 'playwright';
import { checkUrl } from '../../lib/net/guard.ts';
import { startEgressProxy } from '../../scanner/egress-proxy.ts';
import { DiscoveryResult, type Step } from '../contracts/index.ts';
import { LIMITS, buildJourneys, normKey, selectorFor, skipReason, type FoundPage, type PageSnapshot, type RawLink } from './journeys.ts';

type Candidate = { selector: string; text: string; href: string };

/** Everything read from a page in one go: the links a visitor could follow, and what the page is. */
async function readPage(page: Page): Promise<{ snapshot: PageSnapshot; links: RawLink[] }> {
  return page.evaluate(() => {
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const links = [...document.querySelectorAll('a[href]')].map((a) => {
      const el = a as HTMLAnchorElement; const id = el.id; const attr = el.getAttribute('href') ?? '';
      return { text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), href: el.href, attrHref: attr, id, testId: el.getAttribute('data-testid') ?? '', aria: el.getAttribute('aria-label') ?? '',
        targetBlank: el.target === '_blank', visible: vis(el), idCount: id ? document.querySelectorAll(`#${CSS.escape(id)}`).length : 0, hrefCount: document.querySelectorAll(`a[href="${attr.replace(/"/g, '\\"')}"]`).length };
    });
    const h1 = (document.querySelector('h1') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '';
    const KEY = /(calendar|booking|schedule|slots?|pricing|checkout|signup|sign-up|register|contact|form|table)/i;
    let key: { selector: string; label: string } | null = null;
    for (const el of document.querySelectorAll('[role=grid],[role=dialog],form,[id],[data-testid]')) {
      if (!vis(el)) continue; const id = el.id, tid = el.getAttribute('data-testid') ?? '';
      if (id && KEY.test(id) && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) { key = { selector: `#${id}`, label: id }; break; }
      if (tid && KEY.test(tid)) { key = { selector: `[data-testid="${tid}"]`, label: tid }; break; }
    }
    return { snapshot: { url: location.href, title: document.title.slice(0, 200), h1, keyElement: key }, links };
  });
}

export async function discover(startUrl: string, o: { maxMs?: number } = {}): Promise<DiscoveryResult> {
  const t0 = Date.now(), maxMs = o.maxMs ?? LIMITS.totalMs; const origin = new URL(startUrl).origin;
  const skipped = new Map<string, number>(); const limits: string[] = []; const found: FoundPage[] = []; const seen = new Set<string>([normKey(startUrl)]);
  const skip = (r: string) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  await checkUrl(startUrl);
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({ channel: process.env.SUGAM_CHROME_CHANNEL ?? 'chrome', headless: true, args: ['--proxy-bypass-list=<-loopback>', '--disable-extensions'] });
  const timeUp = () => Date.now() - t0 > maxMs;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, proxy: { server: proxy.url } }); const page = await ctx.newPage(); page.setDefaultTimeout(LIMITS.navMs);
    let mainStatus = 200; page.on('response', (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) mainStatus = r.status(); });
    const open = async (url: string) => { await checkUrl(url); const r = await page.goto(url, { timeout: LIMITS.navMs, waitUntil: 'load' }); mainStatus = r?.status() ?? 200; };
    /** Replays a path from the start page, by clicking, so a journey is one the saved flow can repeat. */
    const replay = async (steps: Step[]) => { await open(startUrl); for (const s of steps) { if (s.action !== 'click') continue; await page.locator(s.selector).first().click({ timeout: LIMITS.navMs }); await page.waitForLoadState('load').catch(() => {}); } };
    const step = (c: Candidate, i: number, depth: number): Step => ({ id: `step-${depth}-${i}`, action: 'click', selector: c.selector, label: c.text.slice(0, 100) || c.href, expect: [] }) as Step;

    /** Follows each allowed link on the current page once, records where it led, and goes back to `back`. */
    async function follow(links: RawLink[], prefix: Step[], depth: number): Promise<{ page: FoundPage; links: RawLink[] }[]> {
      const out: { page: FoundPage; links: RawLink[] }[] = []; const here = new Set<string>(); let n = 0;
      for (const l of links) {
        if (timeUp()) { if (!limits.includes('time limit')) limits.push('time limit'); break; }
        if (found.length >= LIMITS.pages) { if (!limits.includes('page limit')) limits.push('page limit'); break; }
        const why = skipReason(l, origin); if (why) { skip(why); continue; }
        const key = normKey(l.href); if (seen.has(key) || here.has(key)) { skip('same page as a link already followed'); continue; } here.add(key);
        const sel = selectorFor(l); if (!sel) { skip('no stable way to select it'); continue; }
        if (++n > LIMITS.linksPerPage) { if (!limits.includes('links per page limit')) limits.push('links per page limit'); break; }
        const c: Candidate = { selector: sel, text: l.text, href: l.href };
        try {
          const before = page.url(); await page.locator(sel).first().click({ timeout: LIMITS.navMs });
          await page.waitForLoadState('load', { timeout: LIMITS.navMs }).catch(() => {}); await page.waitForTimeout(150);
          if (new URL(page.url()).origin !== origin) { skip('leaves the site'); await replay(prefix); continue; }
          if (page.url() === before) { skip('did not go anywhere'); continue; }
          if (mainStatus >= 400) { skip(`page answered ${mainStatus}`); await replay(prefix); continue; }
          const read = await readPage(page); seen.add(normKey(read.snapshot.url)); seen.add(key);
          const steps = [...prefix, step(c, n, depth)]; const fp: FoundPage = { snapshot: read.snapshot, linkText: l.text, steps, depth };
          found.push(fp); out.push({ page: fp, links: read.links });
          await replay(prefix);
        } catch { skip('could not be opened'); try { await replay(prefix); } catch { /* start page itself is gone */ } }
      }
      return out;
    }

    await open(startUrl); const start = await readPage(page); seen.add(normKey(start.snapshot.url));
    const first = await follow(start.links, [], 1);   // everything one click from the start page
    if (LIMITS.depth >= 2) for (const f of first) {      // then one more click from each of those pages
      if (timeUp() || found.length >= LIMITS.pages) break;
      try { await replay(f.page.steps); await follow(f.links, f.page.steps, 2); } catch { skip('could not be reopened'); }
    }
    const journeys = buildJourneys(found, startUrl);
    return DiscoveryResult.parse({ startUrl, ms: Date.now() - t0, pagesVisited: found.length + 1, journeys, skipped: [...skipped].map(([reason, count]) => ({ reason, count })), limits });
  } finally { await browser.close().catch(() => {}); await proxy.close().catch(() => {}); }
}
