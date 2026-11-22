// Three Playwright probes run at the 390px phone width. Each one records what it did and what it saw, and never submits a form.
//   navMenu (MOB-008):     find the collapsed menu button, open it with the keyboard, Tab into it, press Escape. Pattern: WAI-ARIA APG disclosure
//                          navigation / dialog (the button names the menu, says whether it is open, Enter opens it, Escape closes and returns focus).
//   interaction timing (PERF-003): Event Timing entries (PerformanceObserver type "event") for the real key presses and taps the scan makes. This
//                          is lab interaction latency on one load. It is not field INP (p75 over real visits) and Total Blocking Time is never used.
//   journey (UX-014):      after the main action is activated, does the way back work: browser Back returns to the page with the action, a dialog
//                          that opened closes with Escape or a visible close control.
import type { Page } from 'playwright';

export type NavMenu =
  | { found: false; why: string; inlineLinks: number }
  | { found: true; selector: string; name: string; expandedAttr: string | null; target: { w: number; h: number }; focusable?: boolean;
      openedByKeyboard: boolean; openedByClick: boolean | null; linksBefore: number; linksAfter: number; tabIntoMenu: boolean | null;
      escapeCloses: boolean | null; focusReturned: boolean | null; expandedAfterOpen: string | null; notes: string[] };

// Visible links inside nav/header, a candidate menu button, and its controlled region. A string so the bundler leaves it alone.
const MENU_FIND = `function () {
  const shown = (e) => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05 && r.bottom > 0 && r.right > 0 && r.left < innerWidth; };
  const nm = (e) => ((e.getAttribute('aria-label') || e.innerText || e.title || (e.querySelector('[aria-label]') || {}).getAttribute?.('aria-label') || '') + '').replace(/\\s+/g, ' ').trim();
  const navLinks = () => [...document.querySelectorAll('nav a[href], header a[href], [role=navigation] a[href], [role=dialog] a[href]')].filter(shown).length;
  const path = (e) => { if (e.id && /^[A-Za-z][\\w-]*$/.test(e.id)) return '#' + e.id; const p = []; for (let n = e; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) { let s = n.localName; const sib = n.parentElement ? [...n.parentElement.children].filter((x) => x.localName === n.localName) : []; if (sib.length > 1) s += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')'; p.unshift(s); } return 'body > ' + p.join(' > '); };
  const cands = [...document.querySelectorAll('button, [role=button], a[href="#"], a[aria-controls], a[aria-expanded], summary, [class*=hamburger], [class*=burger], [class*=menu-toggle], [class*=nav-toggle], [class*=navbar-toggler]')].filter(shown).filter((e) => {
    const n = nm(e).toLowerCase(); const cls = ((e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) || '') + ' ' + (e.id || '');
    const inTop = e.getBoundingClientRect().top < 160 || !!e.closest('header, nav, [role=banner], [role=navigation]');
    return inTop && (/menu|navigation|nav\\b|open (the )?menu|☰|≡/.test(n) || /hamburger|burger|menu-toggle|nav-toggle|navbar-toggler|menu-button|mobile-menu/i.test(cls) || (e.hasAttribute('aria-expanded') && !!e.closest('header, nav')));
  });
  const b = cands[0];
  if (!b) return { found: false, inlineLinks: navLinks() };
  const r = b.getBoundingClientRect();
  return { found: true, selector: path(b), name: nm(b).slice(0, 60), expanded: b.getAttribute('aria-expanded'), w: Math.round(r.width), h: Math.round(r.height), links: navLinks() };
}`;
const MENU_STATE = `function (sel) {
  const shown = (e) => { if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05 && r.bottom > 0 && r.right > 0 && r.left < innerWidth; };
  const b = document.querySelector(sel);
  const links = [...document.querySelectorAll('nav a[href], header a[href], [role=navigation] a[href], [role=dialog] a[href]')].filter(shown);
  const a = document.activeElement;
  return { links: links.length, expanded: b ? b.getAttribute('aria-expanded') : null, focusOnButton: !!b && (a === b || b.contains(a)), focusInMenu: !!a && a !== b && a.matches && a.matches('a[href]') && links.includes(a) };
}`;

type MenuState = { links: number; expanded: string | null; focusOnButton: boolean; focusInMenu: boolean };
const state = (page: Page, sel: string) => page.evaluate(`(${MENU_STATE})(${JSON.stringify(sel)})`) as Promise<MenuState>;
const opened = (s: MenuState, before: MenuState) => s.expanded === 'true' || s.links > before.links;

export async function navMenu(page: Page): Promise<NavMenu> {
  const f = (await page.evaluate(`(${MENU_FIND})()`)) as { found: boolean; inlineLinks?: number; selector: string; name: string; expanded: string | null; w: number; h: number; links: number };
  if (!f.found) return { found: false, why: (f.inlineLinks ?? 0) > 0 ? `No collapsed menu button at this width; ${f.inlineLinks} navigation link${f.inlineLinks === 1 ? ' is' : 's are'} shown directly.` : 'No navigation menu or navigation links were found at this width.', inlineLinks: f.inlineLinks ?? 0 };
  const notes: string[] = [];
  const before = await state(page, f.selector);
  const loc = page.locator(f.selector).first();
  // Keyboard first: focus the button the way a keyboard user arrives at it, then Enter.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {});
  await loc.focus({ timeout: 2000 }).catch(() => {});
  // Enter is pressed only when the menu button itself has focus: pressed anywhere else it could submit a form, which Avara never does.
  const focusable = (await state(page, f.selector)).focusOnButton;
  if (focusable) { await page.keyboard.press('Enter'); await page.waitForTimeout(450); } else notes.push('The menu button cannot take keyboard focus.');
  let s = await state(page, f.selector);
  const openedByKeyboard = focusable && opened(s, before);
  let openedByClick: boolean | null = null; let tabIntoMenu: boolean | null = null; let escapeCloses: boolean | null = null; let focusReturned: boolean | null = null;
  const expandedAfterOpen = s.expanded; const linksAfterKb = s.links;
  if (!openedByKeyboard) {
    // Does a tap open it? That tells "keyboard cannot open it" from "Avara could not open it at all".
    await loc.click({ timeout: 2500 }).catch(() => notes.push('The menu button could not be tapped.'));
    await page.waitForTimeout(450);
    s = await state(page, f.selector); openedByClick = opened(s, before);
  }
  const isOpen = openedByKeyboard || !!openedByClick;
  if (isOpen) {
    if (focusable) await loc.focus({ timeout: 1500 }).catch(() => {}); else { await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {}); }
    for (let i = 0; i < 4 && !tabIntoMenu; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(60); tabIntoMenu = (await state(page, f.selector)).focusInMenu; }
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const e = await state(page, f.selector);
    escapeCloses = !opened(e, before);
    focusReturned = escapeCloses ? e.focusOnButton : null;
    // Leave the page as it was for the checks that follow.
    if (!escapeCloses) { await loc.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()).catch(() => {});
  return { found: true, selector: f.selector, name: f.name, expandedAttr: f.expanded, target: { w: f.w, h: f.h }, focusable, openedByKeyboard, openedByClick, linksBefore: before.links, linksAfter: openedByKeyboard ? linksAfterKb : s.links, tabIntoMenu, escapeCloses, focusReturned, expandedAfterOpen, notes };
}

// ---------- Interaction timing ----------
export type InteractionTiming = { interactions: number; measured: { name: string; duration: number; target: string }[]; worst: number | null; supported: boolean };
export async function startInteractionTiming(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __avaraEvents?: unknown[]; __avaraInteractions?: number; __avaraTiming?: boolean };
    w.__avaraEvents = []; w.__avaraInteractions = 0;
    w.__avaraTiming = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('event');
    for (const t of ['keydown', 'pointerdown']) addEventListener(t, (ev) => { if (ev.isTrusted) w.__avaraInteractions = (w.__avaraInteractions ?? 0) + 1; }, { capture: true });
    if (!w.__avaraTiming) return;
    const tag = (n: Node | null) => { const e = n as Element | null; if (!e || !e.localName) return ''; return e.localName + (e.id ? '#' + e.id : ''); };
    new PerformanceObserver((list) => { for (const e of list.getEntries() as (PerformanceEntry & { interactionId?: number; target?: Node | null })[]) if (e.interactionId) w.__avaraEvents!.push({ id: e.interactionId, name: e.name, duration: Math.round(e.duration), target: tag(e.target ?? null) }); })
      .observe({ type: 'event', buffered: false, durationThreshold: 16 } as PerformanceObserverInit);
  });
}
export async function readInteractionTiming(page: Page): Promise<InteractionTiming> {
  await page.waitForTimeout(150);
  const r = (await page.evaluate(() => { const w = window as unknown as { __avaraEvents?: { id: number; name: string; duration: number; target: string }[]; __avaraInteractions?: number; __avaraTiming?: boolean }; return { ev: w.__avaraEvents ?? [], n: w.__avaraInteractions ?? 0, ok: !!w.__avaraTiming }; })) as { ev: { id: number; name: string; duration: number; target: string }[]; n: number; ok: boolean };
  // One interaction can produce several events (keydown, keyup); its latency is the longest of them.
  const by = new Map<number, { name: string; duration: number; target: string }>();
  for (const e of r.ev) { const p = by.get(e.id); if (!p || e.duration > p.duration) by.set(e.id, { name: e.name, duration: e.duration, target: e.target }); }
  const measured = [...by.values()].sort((a, b) => b.duration - a.duration);
  // Under 50 interactions INP is the single worst one; every interaction under 16 ms reports as below the observer's threshold.
  return { interactions: r.n, measured: measured.slice(0, 5), worst: r.ok && r.n ? (measured[0]?.duration ?? 0) : null, supported: r.ok };
}

// ---------- Journey continuity: the way back after the main action ----------
export type Journey = { tested: boolean; why?: string; startUrl: string; kind?: 'page' | 'dialog'; backReturns?: boolean | null; backUrl?: string | null; actionAgain?: boolean | null;
  escapeCloses?: boolean | null; closeControl?: string | null; backdropCloses?: boolean | null; steps: string[] };
const DIALOG_STATE = `function () {
  const shown = (e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const d = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].filter(shown);
  const close = d.length ? [...d[d.length - 1].querySelectorAll('button, [role=button], a')].filter(shown).find((b) => /close|dismiss|cancel|back|×|✕|✖/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '') + ' ' + (b.title || ''))) : null;
  return { open: d.length, close: close ? ((close.getAttribute('aria-label') || close.innerText || 'close').replace(/\\s+/g, ' ').trim().slice(0, 40)) : null };
}`;
export const openDialogs = async (page: Page) => ((await page.evaluate(`(${DIALOG_STATE})()`)) as { open: number }).open;
export async function journeyAfterAction(page: Page, o: { startUrl: string; dialogsBefore: number; actionText: string; actionSelector: string }): Promise<Journey> {
  const steps: string[] = [];
  const now = page.url();
  const sameDoc = now.split('#')[0] === o.startUrl.split('#')[0];
  const d = (await page.evaluate(`(${DIALOG_STATE})()`)) as { open: number; close: string | null };
  if (sameDoc && d.open > o.dialogsBefore) {
    steps.push(`After “${o.actionText}”, a dialog is open${d.close ? ` with a “${d.close}” control` : ''}.`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const e = (await page.evaluate(`(${DIALOG_STATE})()`)) as { open: number };
    const escapeCloses = e.open <= o.dialogsBefore;
    steps.push(escapeCloses ? 'Escape closed it.' : 'Escape did not close it.');
    let backdropCloses: boolean | null = null;
    if (!escapeCloses && !d.close) {
      // Some dialogs close only when the backdrop is tapped: a pointer-only way out. Recorded, so the finding says exactly what works.
      await page.mouse.click(4, 4).catch(() => {}); await page.waitForTimeout(400);
      backdropCloses = ((await page.evaluate(`(${DIALOG_STATE})()`)) as { open: number }).open <= o.dialogsBefore;
      steps.push(backdropCloses ? 'Tapping outside it closed it (no keyboard way out).' : 'Tapping outside it did not close it either.');
    }
    return { tested: true, startUrl: o.startUrl, kind: 'dialog', escapeCloses, closeControl: d.close, backdropCloses, steps };
  }
  if (!sameDoc) {
    steps.push(`After “${o.actionText}”, the page is ${safePath(now)}.`);
    await page.goBack({ timeout: 6000, waitUntil: 'domcontentloaded' }).catch(() => steps.push('Back did not complete.'));
    await page.waitForTimeout(700);
    const back = page.url();
    const backReturns = back.split('#')[0] === o.startUrl.split('#')[0];
    let actionAgain: boolean | null = null;
    if (backReturns) actionAgain = await page.locator(o.actionSelector).first().isVisible({ timeout: 1500 }).catch(() => false);
    steps.push(backReturns ? `Back returned to ${safePath(back)}${actionAgain ? ` and “${o.actionText}” is there again` : actionAgain === false ? `, but “${o.actionText}” could not be found again` : ''}.` : `Back went to ${safePath(back) || 'a blank page'} instead of ${safePath(o.startUrl)}.`);
    return { tested: true, startUrl: o.startUrl, kind: 'page', backReturns, backUrl: safePath(back), actionAgain, steps };
  }
  return { tested: false, why: 'The main action changed nothing that needs a way back (no new page and no dialog).', startUrl: o.startUrl, steps };
}
const safePath = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.host + x.pathname : ''; } catch { return ''; } };
