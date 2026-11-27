// Hides secret-shaped text that is VISIBLE on the page, just before a screenshot, and puts the page back right after, so every measurement,
// axe run and detector still sees the real page (findings and their locations do not change). If a detected secret cannot be hidden, no image of
// the page is kept: the caller stores a plain notice instead (fail closed). Nothing here reads pixels: a secret drawn inside an image, a canvas or a
// cross-origin frame cannot be detected (docs/redaction.md). A hostile page that rewrites the browser's own string functions can defeat this check.
import type { BrowserContext, Page } from 'playwright';
import { KINDS, PRIVATE_KEY, JWT, MASK, PRIVATE_KEY_MASK } from '../packages/security-exposure/patterns.ts';

export type MaskResult = { found: number; failed: boolean; kinds: string[] };

const SPEC = { kinds: KINDS.map((k) => ({ s: k.re.source, f: k.re.flags, p: k.prefixes ?? null, n: k.prefixLen ?? 0, name: k.name })), jwt: { s: JWT.source, f: JWT.flags }, pk: { s: PRIVATE_KEY.source, f: PRIVATE_KEY.flags }, mask: MASK, pkMask: PRIVATE_KEY_MASK };

// Runs in the page. Replaces visible text nodes, input values, placeholders and CSS generated content (::before / ::after) that match, remembers the
// originals, then re-scans to prove nothing is left. Any exception undoes what was done and reports failure.
const MASK_IN_PAGE = `(spec) => {
  const KINDS = spec.kinds.map((k) => ({ re: new RegExp(k.s, k.f), p: k.p, n: k.n, name: k.name })); const JWT = new RegExp(spec.jwt.s, spec.jwt.f); const PK = new RegExp(spec.pk.s, spec.pk.f);
  const kinds = new Set(); let found = 0;
  const maskStr = (s, count) => { let t = s;
    t = t.replace(PK, () => { if (count) { found++; kinds.add('Private key'); } return spec.pkMask; });
    t = t.replace(JWT, () => { if (count) { found++; kinds.add('JWT'); } return 'eyJ' + spec.mask; });
    for (const k of KINDS) t = t.replace(k.re, (m) => { if (count) { found++; kinds.add(k.name); } return (k.p ? (k.p.find((x) => m.startsWith(x)) || k.p[k.p.length - 1]) : m.slice(0, k.n)) + spec.mask; });
    return t; };
  const undo = [];
  window.__avaraMaskUndo = () => { for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (e) { /* best effort */ } } undo.length = 0; };
  const seen = new Set(); const targets = []; let styleCss = ''; let pseudoId = 0; const styleEl = document.createElement('style'); styleEl.setAttribute('data-avara-mask', '1');
  const walk = (doc, root) => {
    if (seen.has(root)) return; seen.add(root);
    const w = doc.createTreeWalker(root, 5); let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue; if (maskStr(n.nodeValue, false) !== n.nodeValue) targets.push(['text', n]); continue; }
      if (n.shadowRoot) walk(doc, n.shadowRoot);
      if (n.tagName === 'IFRAME') { try { const d = n.contentDocument; if (d && d.body) walk(d, d.body); } catch (e) { /* cross-origin frame: cannot be reached */ } }
      if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') {
        const type = (n.getAttribute('type') || 'text').toLowerCase();
        if (type !== 'password' && type !== 'hidden' && typeof n.value === 'string' && maskStr(n.value, false) !== n.value) targets.push(['value', n]);
        if (n.placeholder && maskStr(n.placeholder, false) !== n.placeholder) targets.push(['placeholder', n]);
      }
      for (const pe of ['::before', '::after']) { let c = ''; try { c = (doc.defaultView || window).getComputedStyle(n, pe).content; } catch (e) { c = ''; } if (c && c !== 'none' && c !== 'normal' && maskStr(c, false) !== c) targets.push(['pseudo', n, pe]); }
    }
  };
  const scanAll = () => { seen.clear(); targets.length = 0; if (document.body) walk(document, document.body); };
  try {
    scanAll();
    for (const [kind, n, pe] of targets) {
      if (kind === 'text') { const orig = n.nodeValue; const m = maskStr(orig, true); n.nodeValue = m; undo.push(() => { n.nodeValue = orig; }); }
      else if (kind === 'value') { const orig = n.value; n.value = maskStr(orig, true); undo.push(() => { n.value = orig; }); }
      else if (kind === 'placeholder') { const orig = n.placeholder; n.placeholder = maskStr(orig, true); undo.push(() => { n.placeholder = orig; }); }
      else { const id = 'm' + (pseudoId++); const had = n.getAttribute('data-avara-m'); n.setAttribute('data-avara-m', id); styleCss += '[data-avara-m="' + id + '"]' + pe + '{content:"' + spec.mask + '" !important}'; found++; kinds.add('CSS text'); undo.push(() => { if (had === null) n.removeAttribute('data-avara-m'); else n.setAttribute('data-avara-m', had); }); }
    }
    if (styleCss) { styleEl.textContent = styleCss; document.head.appendChild(styleEl); undo.push(() => styleEl.remove()); }
    // Prove it: nothing secret-shaped may remain in what is rendered.
    scanAll(); const left = targets.filter((t) => t[0] !== 'pseudo').length + targets.filter((t) => t[0] === 'pseudo' && !t[1].hasAttribute('data-avara-m')).length;
    const rendered = document.body ? document.body.innerText || '' : ''; if (left > 0 || maskStr(rendered, false) !== rendered) throw new Error('a secret is still visible');
    return { found, failed: false, kinds: [...kinds] };
  } catch (e) { try { window.__avaraMaskUndo(); } catch (x) { /* best effort */ } return { found: Math.max(found, 1), failed: true, kinds: [...kinds] }; }
}`;

/** Hides visible secrets, runs take() on the masked page, restores the page. omitted=true means a secret was found and could not be hidden: take() was not run. */
export async function withMaskedPage<T>(page: Page, take: () => Promise<T>): Promise<{ omitted: boolean; value?: T; hidden: number; kinds: string[] }> {
  let m: MaskResult;
  try { m = (await page.evaluate(`(${MASK_IN_PAGE})(${JSON.stringify(SPEC)})`)) as MaskResult; } catch { return { omitted: true, hidden: 0, kinds: [] }; }   // cannot tell what is visible: fail closed
  if (m.failed) return { omitted: true, hidden: m.found, kinds: m.kinds };
  try { const value = await take(); return { omitted: false, value, hidden: m.found, kinds: m.kinds }; }
  finally { await page.evaluate('window.__avaraMaskUndo && window.__avaraMaskUndo()').catch(() => {}); }
}

/** A plain image that says why the screenshot is not shown, at the size the real one would have had. */
export async function noticeShot(context: BrowserContext, width: number, height: number, type: 'jpeg' = 'jpeg'): Promise<Buffer> {
  const p = await context.newPage();
  try {
    await p.setViewportSize({ width, height: Math.max(120, Math.min(height, 2000)) });
    await p.setContent('<body style="margin:0;display:grid;place-items:center;height:100vh;background:#f4f4f1;font:600 18px system-ui;color:#333;text-align:center"><div style="max-width:80%">Screenshot not shown<br><span style="font-weight:400;font-size:15px">A secret value was visible on this page and could not be hidden, so the image was left out.</span></div></body>');
    return await p.screenshot({ type });
  } finally { await p.close().catch(() => {}); }
}
