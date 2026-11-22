// Code that runs inside the page for Avara's main-action checks. Kept as plain strings, like inpage.ts, so no build step rewrites it.
//   FIND_ACTIONS(goal)      the most likely main actions on the page (the goal the builder confirmed, or a guess from the page itself)
//   MEASURE_ACTION(sel)     where one action really is at this screen size: clipped, off screen, covered, too small, sideways scroll
//   FIELDS_SNAPSHOT(form?)  visible form fields and dialogs, to see what activating the action changed
//   REACH_FIELD(sel)        can a visitor actually reach this field: visible, not covered, able to take focus
const CSS_PATH = `
  const cssPath = (e) => {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\\w-]/g, '\\\\$&'));
    if (e.id && document.querySelectorAll('#' + esc(e.id)).length === 1) return '#' + esc(e.id);
    const parts = [];
    for (let n = e; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      let s = n.localName;
      if (n.id && document.querySelectorAll('#' + esc(n.id)).length === 1) { parts.unshift('#' + esc(n.id)); break; }
      const cl = [...n.classList].slice(0, 2).map(esc); if (cl.length) s += '.' + cl.join('.');
      const p = n.parentElement;
      if (p) { const sib = [...p.children].filter((x) => x.localName === n.localName && x.className === n.className); if (sib.length > 1) s += ':nth-of-type(' + ([...p.children].filter((x) => x.localName === n.localName).indexOf(n) + 1) + ')'; }
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const shown = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const label = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
`;

export const FIND_ACTIONS = `function (goal) {
  ${CSS_PATH}
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\\s+/g, ' ').trim();
  const CTA = /(sign ?up|join|get started|get access|start|try|book|buy|subscribe|waitlist|wait list|demo|contact|download|register|request|claim|free|create account|schedule)/i;
  const cands = [...document.querySelectorAll('a[href],button,[role=button],input[type=submit],input[type=button],summary')].filter((e) => !e.closest('[aria-hidden=true]') && label(e) && !e.disabled);
  const g = goal ? norm(goal) : '';
  const out = [];
  for (const e of cands) {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width * r.height === 0) continue;
    const t = label(e); const nt = norm(t); let how = 'inferred'; let score = 0;
    if (g) {
      if (nt === g) score = 100; else if (nt.includes(g) || g.includes(nt)) score = 80;
      else { const gw = g.split(' '); const hit = gw.filter((w) => w.length > 2 && nt.includes(w)).length; score = gw.length ? (hit / gw.length) * 70 : 0; }
      if (score >= 50) how = 'goal'; else score = 0;
    }
    if (!score) {
      const area = Math.min((r.width * r.height) / (160 * 44), 1);
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      score = (CTA.test(t) ? 50 : 0) + area * 20 + (filled ? 15 : 0) + (r.top + scrollY < innerHeight * 1.2 ? 15 : 0) - (e.closest('nav,header') && !CTA.test(t) ? 25 : 0) - (t.length > 40 ? 15 : 0) - (e.localName === 'summary' ? 20 : 0);
    }
    if (score <= 0) continue;
    const form = e.closest('form');
    const submits = !!form && ((e.localName === 'button' && (e.getAttribute('type') || 'submit') === 'submit') || (e.localName === 'input' && e.type === 'submit'));
    const href = e.localName === 'a' ? e.href || '' : '';
    out.push({ selector: cssPath(e), text: t.slice(0, 80), how, score: Math.round(score), tag: e.localName, html: e.outerHTML.replace(/\\s+/g, ' ').slice(0, 260), submits, formSelector: form ? cssPath(form) : null, href, external: !!href && /^https?:/i.test(href) && new URL(href).origin !== location.origin, mail: /^(mailto|tel):/i.test(href) });
  }
  out.sort((a, b) => b.score - a.score);
  return { candidates: out.slice(0, 3), viewport: { w: innerWidth, h: innerHeight } };
}`;

export const MEASURE_ACTION = `function (sel, text) {
  ${CSS_PATH}
  let el = null; try { el = document.querySelector(sel); } catch (e) { el = null; }
  if (!el && text) { const t = text.toLowerCase(); el = [...document.querySelectorAll('a,button,[role=button],input[type=submit]')].find((x) => shown(x) && label(x).toLowerCase() === t) || null; }
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  const r0 = el.getBoundingClientRect();
  const topBefore = r0.top + scrollY;
  const rendered = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r0.width > 2 && r0.height > 2;
  const pe = (() => { for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).pointerEvents === 'none') return true; return false; })();
  const docW = document.documentElement.scrollWidth;
  const xHidden = ['hidden', 'clip'].includes(getComputedStyle(document.documentElement).overflowX) || ['hidden', 'clip'].includes(getComputedStyle(document.body).overflowX);
  // Scroll the PAGE only. scrollIntoView would also scroll overflow:hidden containers, which a visitor cannot do, and would hide the very problem.
  // behavior 'instant': a page with scroll-behavior:smooth would otherwise still be mid-scroll when we measure, and the check would test the wrong part of the page.
  scrollTo({ left: window.scrollX, top: Math.max(0, r0.top + scrollY - innerHeight / 2 + r0.height / 2), behavior: 'instant' });
  const r = el.getBoundingClientRect();
  // the part of the box a visitor can see: cut it down by every ancestor that clips its overflow, and by the screen itself
  let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
  let clippedBy = null, clipEl = null;
  for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const c = getComputedStyle(n);
    if (['hidden', 'clip', 'scroll', 'auto'].includes(c.overflowX) || ['hidden', 'clip', 'scroll', 'auto'].includes(c.overflowY)) {
      const q = n.getBoundingClientRect(); const nv = { l: Math.max(vis.l, q.left), t: Math.max(vis.t, q.top), r: Math.min(vis.r, q.right), b: Math.min(vis.b, q.bottom) };
      const before = Math.max(0, (vis.r - vis.l)) * Math.max(0, (vis.b - vis.t)); const after = Math.max(0, (nv.r - nv.l)) * Math.max(0, (nv.b - nv.t));
      if (after < before - 1 && !clippedBy) { clippedBy = cssPath(n); clipEl = n; }
      vis = nv;
    }
  }
  vis = { l: Math.max(vis.l, 0), t: Math.max(vis.t, 0), r: Math.min(vis.r, innerWidth), b: Math.min(vis.b, innerHeight) };
  const area = r.width * r.height;
  const visArea = Math.max(0, vis.r - vis.l) * Math.max(0, vis.b - vis.t);
  const visibleRatio = area > 0 ? Math.round((visArea / area) * 100) / 100 : 0;
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx, cy);
  const covered = !!top && top !== el && !el.contains(top) && !top.contains(el);
  let cover = null, coverEl = null;
  if (covered) { let holder = top; let pos = getComputedStyle(top).position; for (let n = top.parentElement; n && pos === 'static'; n = n.parentElement) { pos = getComputedStyle(n).position; holder = n; } coverEl = holder; cover = { selector: cssPath(holder), position: pos, text: label(top).slice(0, 40), dismissible: (() => { const hay = ((holder.id || '') + ' ' + (holder.className || '') + ' ' + (holder.innerText || '').slice(0, 400)).toLowerCase(); return /cookie|consent|gdpr|privacy (choices|preferences)/.test(hay) && [...holder.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')].some((c) => /accept|agree|allow|reject|decline|deny|got it|dismiss|close|manage|preferences|save/i.test(label(c))); })(), box: (() => { const q = holder.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), width: Math.round(q.width), height: Math.round(q.height) }; })() }; }
  return {
    found: true, selector: cssPath(el), text: label(el).slice(0, 80), html: el.outerHTML.replace(/\\s+/g, ' ').slice(0, 260), tag: el.localName,
    rendered, pointerEventsNone: pe, disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
    box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
    width: Math.round(r.width), height: Math.round(r.height), belowFirstScreen: topBefore > innerHeight,
    outsideX: r.left < -1 || r.right > innerWidth + 1, sidewaysScrollPossible: docW > innerWidth + 1 && !xHidden, xOverflowHidden: xHidden,
    pageWidth: docW, viewportWidth: innerWidth, visibleRatio, clippedBy, covered, cover,
    // Code evidence on the very elements measured (scanner/code-evidence.ts): a path selector can match more than one of them.
    code: typeof window.__avaraCodeEvidence === 'function' ? window.__avaraCodeEvidence({ targets: [{ key: 'action', node: el, props: ['display', 'min-width', 'min-height'] }, ...(coverEl ? [{ key: 'cover', node: coverEl, props: ['position', 'display'] }] : []), ...(clipEl ? [{ key: 'clippedBy', node: clipEl, props: ['flex-wrap', 'overflow', 'overflow-x'] }] : [])] }) : null,
    centerPoint: { x: Math.round(cx), y: Math.round(cy) },
  };
}`;

export const FIELDS_SNAPSHOT = `function (formSel) {
  ${CSS_PATH}
  let root = document; if (formSel) { try { root = document.querySelector(formSel) || document; } catch (e) { root = document; } }
  const fields = [...root.querySelectorAll('input,textarea,select')].filter((e) => !['hidden', 'submit', 'button', 'image', 'reset', 'checkbox', 'radio'].includes(e.type) && shown(e) && !e.disabled)
    .map((e) => ({ selector: cssPath(e), name: (e.labels && e.labels[0] ? e.labels[0].innerText : e.getAttribute('aria-label') || e.placeholder || e.name || e.type || '').replace(/\\s+/g, ' ').trim().slice(0, 60), type: e.type || e.localName }));
  const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open]')].filter(shown).map((e) => ({ selector: cssPath(e), label: (e.getAttribute('aria-label') || (e.querySelector('h1,h2,h3') || {}).innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60) }));
  return { url: location.href, hash: location.hash, scrollY: Math.round(scrollY), fields, dialogs };
}`;

export const REACH_FIELD = `function (sel) {
  ${CSS_PATH}
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  { const q = el.getBoundingClientRect(); scrollTo(window.scrollX, Math.max(0, q.top + scrollY - innerHeight / 2 + q.height / 2)); }
  const r = el.getBoundingClientRect();
  const inView = r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx, cy);
  const covered = !!top && top !== el && !el.contains(top) && !top.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(top)));
  let cover = null;
  if (covered) { let holder = top; let pos = getComputedStyle(top).position; for (let n = top.parentElement; n && pos === 'static'; n = n.parentElement) { pos = getComputedStyle(n).position; holder = n; } cover = { selector: cssPath(holder), position: pos }; }
  try { el.focus({ preventScroll: true }); } catch (e) {}
  const focused = document.activeElement === el;
  return { found: true, shown: shown(el), inView, covered, cover, focused, inert: !!el.closest('[inert]'), size: { w: Math.round(r.width), h: Math.round(r.height) } };
}`;

// The page as a reviewer sees it, as plain data for the rule engine: text, headings, calls to action, navigation, forms, contact and legal links,
// proof, pricing wording and sampled typography. No rules in here, only observations.
export const PAGE_CONTEXT = `function () {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => t(e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('title') || '');
  const abs = (h) => { try { return new URL(h, location.href).href.slice(0, 300); } catch (e) { return null; } };
  const rgbaA = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return 1; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
  const style = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { bg: c.backgroundColor, color: c.color, fontSize: parseFloat(c.fontSize), fontWeight: c.fontWeight, radius: parseFloat(c.borderTopLeftRadius) || 0, width: Math.round(r.width), height: Math.round(r.height), filled: rgbaA(c.backgroundColor) > 0.1, border: c.borderTopWidth };
  };
  const links = (root, n) => [...root.querySelectorAll('a[href]')].filter(vis).slice(0, n).map((a) => ({ text: label(a).slice(0, 80), href: a.getAttribute('href').slice(0, 160) }));
  const lines = (re, n) => (document.body.innerText || '').split(/\\n+/).map(t).filter((l) => l && l.length < 220 && re.test(l)).slice(0, n);
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(vis).slice(0, 40).map((h) => ({ level: Number(h.tagName[1]), text: t(h.innerText).slice(0, 160) }));
  let first = ''; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n && first.length < 1500; n = w.nextNode()) { const p = n.parentElement; if (!p || !t(n.nodeValue) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue; const r = p.getBoundingClientRect(); if (vis(p) && r.top >= 0 && r.top < innerHeight) first += t(n.nodeValue) + ' '; }
  const ctas = [...document.querySelectorAll('button, a[role=button], input[type=submit], a.btn, a[class*=button], a[class*=cta], [class*=cta]')].filter(vis).slice(0, 20).map((e) => ({ text: label(e).slice(0, 80), tag: e.tagName.toLowerCase(), href: e.getAttribute('href') ? abs(e.getAttribute('href')) : null, inViewport: e.getBoundingClientRect().top < innerHeight, style: style(e) }));
  const forms = [...document.querySelectorAll('form')].slice(0, 6).map((f) => ({
    fields: [...f.querySelectorAll('input, select, textarea')].filter((i) => i.type !== 'hidden').slice(0, 25).map((i) => ({ type: i.type || i.localName, label: t((i.labels && i.labels[0] && i.labels[0].innerText) || i.getAttribute('aria-label') || i.placeholder || '').slice(0, 60), required: i.required, name: i.name || null })),
    submit: label(f.querySelector('button[type=submit], input[type=submit], button') || document.body).slice(0, 60),
  }));
  const all = [...document.querySelectorAll('a[href]')].filter(vis);
  const find = (re) => all.filter((a) => re.test(label(a) + ' ' + (a.getAttribute('href') || ''))).slice(0, 4).map((a) => ({ text: label(a).slice(0, 60), href: abs(a.getAttribute('href')) }));
  let run = 0, maxRun = 0, lastHeading = '', runHeading = ''; let words = 0;
  for (const e of [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td')].filter(vis)) { if (/^H[1-6]$/.test(e.tagName)) { run = 0; lastHeading = t(e.innerText).slice(0, 80); continue; } const n = t(e.innerText).split(' ').filter(Boolean).length; words += n; run += n; if (run > maxRun) { maxRun = run; runHeading = lastHeading; } }
  const text = document.body.innerText || '';
  const sections = [...document.querySelectorAll('section, div')].filter((s) => /trusted by|our customers|used by|partners|as seen/i.test((s.querySelector('h1,h2,h3,p') || {}).innerText || '')).slice(0, 3);
  const sample = (sel, role) => { const e = [...document.querySelectorAll(sel)].find(vis); if (!e) return null; const c = getComputedStyle(e); return { role, fontFamily: c.fontFamily.slice(0, 80), fontSize: c.fontSize, fontWeight: c.fontWeight, lineHeight: c.lineHeight, color: c.color }; };
  return {
    title: document.title, lang: document.documentElement.lang || null, metaDescription: (document.querySelector('meta[name=description]') || {}).content || null,
    headings, firstViewportText: t(first).slice(0, 1500), ctas, nav: links(document.querySelector('nav, header') || document.body, 30), footerLinks: links(document.querySelector('footer') || document.body, 40), forms,
    contact: { mailto: [...document.querySelectorAll('a[href^="mailto:"]')].slice(0, 3).map((a) => a.getAttribute('href')), tel: [...document.querySelectorAll('a[href^="tel:"]')].slice(0, 3).map((a) => a.getAttribute('href')), contactLinks: find(/contact|support|help|get in touch/i), emailInText: (text.match(/[\\w.+-]+@[\\w-]+\\.[\\w.]+/) || [null])[0] },
    legalLinks: { privacy: find(/privacy/i), terms: find(/terms|conditions/i) },
    linkTargets: { contact: find(/contact|get in touch|email us/i), support: find(/support|help cent|help$|faq|customer service/i), reviews: find(/reviews|testimonials|case stud|trustpilot|g2\\.com|capterra/i), trial: find(/free trial|start.*trial|try .*free|get started free/i) },
    trialMentions: lines(/free trial|try (it )?free|start (your )?(free )?trial|\\d+[- ]day (free )?trial/i, 5), reviewClaims: lines(/★|⭐|rated|[0-9.]+ ?\\/ ?5|[0-9.]+ stars?|[0-9,]+ reviews/i, 6),
    agreeMentions: lines(/i agree|terms of (service|use)|terms and conditions/i, 4), personalDataForms: forms.filter((f) => f.fields.some((x) => /^(email|tel)$/.test(x.type) || /e-?mail|phone|name|address/i.test((x.label || '') + (x.name || '')))).length,
    testimonials: [...document.querySelectorAll('blockquote, figure, [class*=testimonial], [class*=review]')].filter(vis).slice(0, 5).map((e) => t(e.innerText).slice(0, 240)),
    logos: sections.flatMap((s) => [...s.querySelectorAll('img[alt]')].map((i) => i.alt)).slice(0, 12),
    securityMentions: lines(/secure|encrypt|ssl|soc ?2|gdpr|pci|privacy/i, 5), pricing: lines(/[$€£]\\s?\\d|per month|\\/mo\\b|free trial|pricing/i, 8),
    typography: [sample('h1', 'h1'), sample('h2', 'h2'), sample('p', 'body'), sample('button, a[role=button]', 'button'), sample('a[href]', 'link')].filter(Boolean),
    colors: [...new Set([...document.querySelectorAll('button, a[role=button]')].filter(vis).slice(0, 12).map((e) => getComputedStyle(e).backgroundColor))].slice(0, 6),
    reading: { totalWords: words, longestRunWords: maxRun, underHeading: runHeading || null },
    bodyText: text.slice(0, 8000),
  };
}`;


// Mobile-only observations that change nothing on the page: images against the 320px screen, the viewport tag, text sizes, form inputs.
export const MOBILE_PROBE = `function () {
  ${CSS_PATH}
  const imgs = [...document.images].filter(shown).slice(0, 80).map((i) => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i); return { selector: cssPath(i), nw: i.naturalWidth, nh: i.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height), fit: cs.objectFit, right: Math.round(r.right), svg: /\\.svg(\\?|$)/i.test(i.currentSrc || i.src || ''), loaded: i.complete && i.naturalWidth > 0 }; });
  const meta = document.querySelector('meta[name=viewport]');
  const texts = [...document.querySelectorAll('p, li, td, dd, label, a, button, span')].filter((e) => shown(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 3));
  const sizes = texts.map((e) => ({ e, px: parseFloat(getComputedStyle(e).fontSize) }));
  const small = sizes.filter((x) => x.px < 12);
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea')].filter(shown).slice(0, 40).map((e) => { const r = e.getBoundingClientRect(); return { selector: cssPath(e), px: parseFloat(getComputedStyle(e).fontSize), width: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) }; });
  return { images: imgs, viewportMeta: meta ? meta.content : null, innerWidth, textCount: texts.length, smallCount: small.length, smallSamples: small.slice(0, 5).map((x) => ({ selector: cssPath(x.e), px: x.px, text: (x.e.innerText || '').slice(0, 40) })), minPx: sizes.length ? Math.min(...sizes.map((x) => x.px)) : null, bodyPx: parseFloat(getComputedStyle(document.body).fontSize), inputs };
}`;

// Text at 200% (WCAG 1.4.4): scales every text element's size, then reports what is clipped that was not clipped before. Changes the page, so it runs last.
export const TEXT_RESIZE = `function () {
  ${CSS_PATH}
  const clipped = () => { const out = []; for (const e of document.querySelectorAll('body *')) { if (!shown(e) || !(e.innerText || '').trim()) continue; const cs = getComputedStyle(e); const cx = /(hidden|clip)/.test(cs.overflowX), cy = /(hidden|clip)/.test(cs.overflowY); const sx = e.scrollWidth - e.clientWidth, sy = e.scrollHeight - e.clientHeight; if ((cx && sx > 2 && cs.textOverflow !== 'ellipsis') || (cy && sy > 2)) out.push({ selector: cssPath(e), kind: cy && sy > 2 ? 'height' : 'width', by: Math.max(sx, sy), text: (e.innerText || '').trim().slice(0, 50) }); } return out; };
  const before = clipped(); const known = new Set(before.map((x) => x.selector));
  const targets = [...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 0)).map((e) => ({ e, px: parseFloat(getComputedStyle(e).fontSize) }));
  for (const t of targets) t.e.style.setProperty('font-size', (t.px * 2) + 'px', 'important');
  const after = clipped(); const added = after.filter((x) => !known.has(x.selector));
  return { baselineClipped: before.slice(0, 6), newlyClipped: added.slice(0, 8), scaled: targets.length };
}`;


// The shape of the page as plain data: hero, the large sections in order (with repeated-card groups), app UI (sidebar, stat cards, charts), and design
// signals (fonts, gradients, radii, shadows, icon style). Observations only; the rules that read them live in src/rules/*.json.
export const STRUCTURE_CONTEXT = `function () {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')).slice(0, 80);
  const words = (s) => t(s).split(' ').filter(Boolean).length;
  const top = (e) => Math.round(e.getBoundingClientRect().top + scrollY);
  const sizeOf = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const isIcon = (e) => { if (!/^(svg|img)$/i.test(e.tagName)) return false; const [w, h] = sizeOf(e); return w > 4 && h > 4 && w <= 96 && h <= 96; };
  const ctaSel = 'button, a[role=button], a[class*=btn], a[class*=button], a[class*=cta], input[type=submit]';

  // ---- hero ----
  const h1 = [...document.querySelectorAll('h1')].find(vis) || null;
  let sub = null;
  if (h1) { let n = h1.nextElementSibling; for (let i = 0; i < 3 && n; i++, n = n.nextElementSibling) { const x = t(n.innerText); if (vis(n) && words(x) >= 4 && !n.matches(ctaSel) && !n.querySelector('h1')) { sub = { text: x.slice(0, 280), words: words(x), tag: n.tagName.toLowerCase() }; break; } } }
  const hero = { h1: h1 ? { text: t(h1.innerText).slice(0, 200), words: words(h1.innerText), top: top(h1), inViewport: h1.getBoundingClientRect().top < innerHeight } : null, subheadline: sub };

  // ---- sections: the large blocks of the page, in order ----
  let kids = [...(document.querySelector('main') || document.body).children].filter(vis);
  while (kids.length === 1 && kids[0].children.length > 1) kids = [...kids[0].children].filter(vis);
  if (kids.length < 3) kids = [...document.querySelectorAll('section')].filter(vis);
  const foot = [...document.querySelectorAll('footer')].filter(vis).pop();
  if (foot && !kids.some((k) => k === foot || k.contains(foot) || foot.contains(k))) kids.push(foot);
  const repeated = (els) => {
    let best = null;
    for (const p of els.flatMap((el) => [el, ...[...el.querySelectorAll('div,ul,ol,section')].slice(0, 80)])) {
      const ch = [...p.children].filter(vis); if (ch.length < 3) continue;
      const sig = (k) => k.tagName + '|' + [...k.classList].slice(0, 3).join('.') + '|' + k.children.length;
      const groups = {}; ch.forEach((k) => { (groups[sig(k)] = groups[sig(k)] || []).push(k); });
      for (const g of Object.values(groups)) {
        if (g.length < 3) continue; const w0 = g[0].getBoundingClientRect().width; if (g.some((k) => Math.abs(k.getBoundingClientRect().width - w0) > w0 * 0.25 + 8)) continue;
        const icon = g.filter((k) => [...k.querySelectorAll('svg,img')].some(isIcon) || /^\\p{Extended_Pictographic}/u.test(t(k.innerText))).length;
        const head = g.filter((k) => k.querySelector('h2,h3,h4,h5,h6,[class*=title],strong')).length;
        const para = g.filter((k) => k.querySelector('p') || words(k.innerText) >= 8).length;
        const tops = new Set(g.map((k) => Math.round(k.getBoundingClientRect().top / 10)));
        const cand = { count: g.length, icons: icon, headings: head, paragraphs: para, columns: Math.round(g.length / tops.size) || g.length, selector: label(p), titles: g.slice(0, 4).map((k) => t((k.querySelector('h2,h3,h4,h5,h6,[class*=title],strong') || k).innerText).slice(0, 50)) };
        if (!best || cand.count * (cand.icons ? 1.5 : 1) > best.count * (best.icons ? 1.5 : 1)) best = cand;
      }
    }
    return best;
  };
  // Pages written as one flat column (heading, paragraph, heading ...) are cut into sections at each h1/h2.
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  let units = kids.map((k) => [k]);
  if (kids.length >= 6 && kids.filter((k) => /^(H[1-6]|P|UL|OL|BLOCKQUOTE|PRE|TABLE|FIGURE|IMG|HR)$/.test(k.tagName)).length >= kids.length * 0.6) {
    units = []; let cur = [];
    for (const k of kids) { if ((/^H[1-2]$/.test(k.tagName) || k.tagName === 'FOOTER') && cur.length) { units.push(cur); cur = []; } cur.push(k); }
    if (cur.length) units.push(cur);
  }
  const Q = (els, sel) => els.flatMap((e) => [...(e.matches(sel) ? [e] : []), ...e.querySelectorAll(sel)]);
  const sections = units.slice(0, 30).map((els, i) => {
    const el = els[0]; const heads = Q(els, 'h1,h2,h3').filter(vis).slice(0, 3).map((h) => ({ level: Number(h.tagName[1]), text: t(h.innerText).slice(0, 100) }));
    const txt = els.map((e) => e.innerText || '').join(' '); const media = Q(els, 'img,picture,video,canvas').filter(vis);
    const logos = Q(els, 'img').filter((x) => vis(x) && sizeOf(x)[1] <= 80 && sizeOf(x)[0] <= 220);
    const cs = getComputedStyle(el); const hs = Q(els, 'h1,h2,h3').filter(vis);
    const colsSplit = (() => { const rs = els.flatMap((e) => [...e.querySelectorAll(':scope > *, :scope > * > *')]).filter(vis).map((c) => c.getBoundingClientRect()).filter((r) => r.width > innerWidth * 0.25 && r.width < innerWidth * 0.8); let best = 1; for (const a of rs) { const set = new Set(); for (const r of rs) if (r.top < a.bottom && r.bottom > a.top) set.add(Math.round(r.left / 80)); best = Math.max(best, set.size); } return best; })();
    return {
      index: i, tag: el.tagName.toLowerCase(), selector: label(el), top: top(el), height: Math.round(els[els.length - 1].getBoundingClientRect().bottom + scrollY - top(el)), headings: heads, words: words(txt),
      ctas: Q(els, ctaSel).length, bigMedia: media.filter((m) => sizeOf(m)[0] >= 200 && sizeOf(m)[1] >= 120).length, icons: Q(els, 'svg,img').filter((x) => vis(x) && isIcon(x)).length,
      prices: (txt.match(/[$€£]\\s?\\d|\\/\\s?(mo|month|yr|year)\\b|per (month|year|seat|user)/gi) || []).length, faqMarks: Q(els, 'details, [aria-expanded], [class*=accordion]').length + heads.filter((h) => /\\?$/.test(h.text)).length,
      quotes: Q(els, 'blockquote, [class*=testimonial], [class*=quote]').length, quoteChars: (txt.match(/[“”"]/g) || []).length, stars: (txt.match(/★|⭐/g) || []).length,
      avatars: Q(els, 'img').filter((x) => vis(x) && sizeOf(x)[0] <= 80 && /50%|9999|999/.test(getComputedStyle(x).borderRadius)).length,
      logos: logos.length, linkedLogos: logos.filter((x) => x.closest('a[href]')).length, centered: cs.textAlign === 'center' || hs.some((h) => getComputedStyle(h).textAlign === 'center'),
      gradient: /gradient/.test(cs.backgroundImage) || (el.firstElementChild && /gradient/.test(getComputedStyle(el.firstElementChild).backgroundImage)), columns: colsSplit,
      group: repeated(els), links: Q(els, 'a[href]').length,
    };
  });

  // ---- app UI (dashboards) ----
  const num = /^[-+]?[$€£]?\\d[\\d,.]*\\s?[kKmMbB%]?$/;
  const left = [...document.querySelectorAll('aside, nav')].filter((e) => { const r = e.getBoundingClientRect(); return vis(e) && r.left < 12 && r.width >= 150 && r.width <= 340 && r.height > innerHeight * 0.5 && e.querySelectorAll('a,button').length >= 5; })[0] || null;
  const statCards = (() => { let best = 0, sel = null; for (const p of document.querySelectorAll('div,ul,section')) { const ch = [...p.children].filter(vis); if (ch.length < 3 || ch.length > 8) continue; const ok = ch.filter((k) => { const parts = [...k.querySelectorAll('*')].filter((n) => !n.children.length).map((n) => t(n.innerText)).filter(Boolean); return parts.length >= 2 && parts.length <= 5 && parts.some((x) => num.test(x)) && words(k.innerText) <= 10; }); if (ok.length >= 3 && ok.length > best) { best = ok.length; sel = label(p); } } return { count: best, selector: sel }; })();
  const charts = [...document.querySelectorAll('canvas, svg[class*=chart], svg[class*=recharts], [class*=chart], [class*=apexcharts], [class*=highcharts], [class*=recharts]')].filter(vis).filter((e) => sizeOf(e)[0] >= 160 && sizeOf(e)[1] >= 80);
  const tables = [...document.querySelectorAll('table')].filter((e) => vis(e) && e.querySelectorAll('tr').length >= 4);
  const topbar = [...document.querySelectorAll('header, [class*=topbar], [class*=navbar]')].filter(vis).some((h) => h.querySelector('input[type=search], input[placeholder*=earch]') && h.querySelector('img[alt*=vatar], [class*=avatar], img[class*=rounded]'));
  const app = { sidebar: left ? { selector: label(left), width: sizeOf(left)[0], links: left.querySelectorAll('a,button').length } : null, statCards, charts: charts.length, chartSelectors: charts.slice(0, 3).map(label), tables: tables.length, topbar };

  // ---- design signals ----
  const fams = {}; const sample = [...document.querySelectorAll('h1,h2,h3,p,li,a,button,span,label')].filter(vis).slice(0, 300);
  let totalChars = 0; sample.forEach((e) => { const n = (e.innerText || '').length; if (!n) return; const f = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(); fams[f] = (fams[f] || 0) + n; totalChars += n; });
  const fonts = Object.entries(fams).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => ({ family: f, share: totalChars ? Math.round((100 * n) / totalChars) : 0 }));
  const boxes = [...document.querySelectorAll('div,section,article,li,header,button,a')].filter(vis).slice(0, 500);
  const gradients = boxes.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage)).length;
  const textGradients = boxes.filter((e) => /text/.test(getComputedStyle(e).webkitBackgroundClip || getComputedStyle(e).backgroundClip || '') && /gradient/.test(getComputedStyle(e).backgroundImage)).length;
  const cards = boxes.filter((e) => { const [w, h] = sizeOf(e); const c = getComputedStyle(e); return w >= 150 && w <= 640 && h >= 80 && h <= 700 && parseFloat(c.borderTopLeftRadius) >= 6 && (c.boxShadow !== 'none' || parseFloat(c.borderTopWidth) > 0) && e.querySelector('h2,h3,h4,p'); }).slice(0, 120);
  const radii = cards.map((e) => Math.round(parseFloat(getComputedStyle(e).borderTopLeftRadius))); const shadows = cards.filter((e) => getComputedStyle(e).boxShadow !== 'none').length;
  const icons = [...document.querySelectorAll('svg')].filter((e) => vis(e) && isIcon(e));
  const libLike = icons.filter((e) => (e.getAttribute('viewBox') || '') === '0 0 24 24' && (/currentcolor/i.test(e.getAttribute('stroke') || '') || (e.getAttribute('fill') === 'none' && e.getAttribute('stroke'))) && /^(2|1\\.5)$/.test(e.getAttribute('stroke-width') || '')).length;
  const emoji = [...document.querySelectorAll('span,div,i')].filter((e) => vis(e) && !e.children.length && /^\\p{Extended_Pictographic}️?$/u.test(t(e.innerText))).length;
  const buttons = [...new Set([...document.querySelectorAll(ctaSel)].filter(vis).map((e) => getComputedStyle(e).backgroundColor).filter((c) => !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)))].slice(0, 6);
  const design = { fonts, headingFont: h1 ? getComputedStyle(h1).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase() : null, gradients, textGradients, cards: cards.length, cardRadii: radii, cardShadows: shadows, icons: icons.length, iconLibraryLike: libLike, emojiIcons: emoji, buttonColors: buttons };

  // ---- calls to action in the first screen ----
  const ctxWords = (e) => { const own = t(e.innerText || ''); let n = e.parentElement, w = 0; for (let i = 0; i < 3 && n; i++, n = n.parentElement) { w = words(t(n.innerText || '').replace(own, '')); if (w >= 6) break; } return w; };
  const firstCtas = [...document.querySelectorAll(ctaSel)].filter((e) => vis(e) && !e.closest('header, nav') && e.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().top >= 0).map((e) => ({ text: t(e.innerText || e.value || e.getAttribute('aria-label') || '').slice(0, 50), filled: !/rgba\\(0, 0, 0, 0\\)|transparent/.test(getComputedStyle(e).backgroundColor), href: e.getAttribute('href'), top: top(e), context: ctxWords(e) }));
  const logoEl = [...document.querySelectorAll('header a img, header a svg, header img, header svg, [class*=logo] img, [class*=logo] svg')].find(vis);
  const brand = { logo: !!logoEl, favicon: !!document.querySelector('link[rel~=icon]'), title: document.title, bigImages: [...document.querySelectorAll('img,picture,video')].filter((m) => vis(m) && sizeOf(m)[0] >= 200 && sizeOf(m)[1] >= 120).length };
  const allCtaText = [...document.querySelectorAll(ctaSel)].filter(vis).map((e) => t(e.innerText || e.value || '').toLowerCase()).filter(Boolean);
  const repeatedCta = Object.entries(allCtaText.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])[0] || null;

  // ---- what the eye lands on in the first screen (weight = visible area x contrast; filled buttons count extra; images count as 0.6) ----
  const lum = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(c || ''); if (!m) return 1; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c); if (m && (m[4] === undefined || +m[4] > 0.5)) return c; } return 'rgb(255, 255, 255)'; };
  const vh = innerHeight; const emphasis = [];
  const addEm = (e, kind) => {
    if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.top >= vh || r.bottom <= 0) return;
    const area = Math.round(Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))); if (area < 400) return;
    const cs = getComputedStyle(e); const ct = Math.abs(lum(cs.color) - lum(bgOf(e)));
    const filled = kind === 'cta' ? Math.abs(lum(cs.backgroundColor) - lum(bgOf(e.parentElement || e))) : 0;
    const w = kind === 'media' ? area * 0.6 : kind === 'cta' ? area * (0.2 + Math.max(ct, filled)) * (rgbaFilled(cs.backgroundColor) ? 1.5 : 1) : area * (0.2 + ct);
    emphasis.push({ kind, selector: label(e), text: t(e.innerText || e.alt || '').slice(0, 60), area, weight: Math.round(w), top: top(e) });
  };
  const rgbaFilled = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return false; const p = m[1].split(',').map((x) => parseFloat(x)); return (p.length > 3 ? p[3] : 1) > 0.1; };
  document.querySelectorAll('h1').forEach((e) => addEm(e, 'h1')); document.querySelectorAll('h2,h3').forEach((e) => addEm(e, 'heading'));
  document.querySelectorAll(ctaSel).forEach((e) => { if (!e.closest('header, nav')) addEm(e, 'cta'); });
  document.querySelectorAll('img, video, picture').forEach((e) => { const [w, h] = sizeOf(e); if (w >= 120 && h >= 80) addEm(e.tagName === 'PICTURE' ? (e.querySelector('img') || e) : e, 'media'); });

  // ---- vertical gaps between stacked siblings, to see whether spacing follows a scale ----
  const gaps = {}; let nGaps = 0;
  for (const p of document.querySelectorAll('main, main *, body > *')) {
    if (nGaps > 400) break; const ch = [...p.children].filter(vis); if (ch.length < 2 || ch.length > 40) continue;
    for (let i = 1; i < ch.length; i++) { const a = ch[i - 1].getBoundingClientRect(), b = ch[i].getBoundingClientRect(); const g = Math.round(b.top - a.bottom); if (g >= 2 && g <= 160 && Math.abs(b.left - a.left) < 4) { gaps[g] = (gaps[g] || 0) + 1; nGaps++; } }
  }
  return { emphasis, gaps, hero, sections, app, design, brand, firstCtas, ctaCounts: { total: allCtaText.length, top: repeatedCta ? { text: repeatedCta[0], count: repeatedCta[1] } : null }, viewportHeight: innerHeight, words: words(document.body.innerText || '') };
}
`;

// Client-side validation probe: asks the browser to validate each form WITHOUT submitting it (reportValidity), then reads where focus went and what the message says.
export const VALIDATION_PROBE = `function () {
  const label = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')).slice(0, 80);
  const out = [];
  for (const f of [...document.forms].slice(0, 4)) {
    const fields = [...f.querySelectorAll('input,select,textarea')].filter((i) => !/^(hidden|submit|button|image|reset)$/.test(i.type) && !i.disabled);
    if (!fields.length || (fields.length === 1 && fields[0].type === 'search')) continue;
    const constrained = fields.filter((i) => i.required || /^(email|url|tel|number)$/.test(i.type) || i.pattern || i.minLength > 0).length;
    const prefilled = fields.some((i) => i.value && i.type !== 'checkbox' && i.type !== 'radio');
    let valid = null, focusOK = null, msg = '';
    if (constrained && !prefilled && !f.noValidate) { try { valid = f.checkValidity(); const ok = f.reportValidity(); const a = document.activeElement; focusOK = !ok && !!a && f.contains(a) && a.matches(':invalid'); msg = (a && a.validationMessage) || ''; } catch (e) {} }
    out.push({ selector: label(f), fields: fields.length, constrained, prefilled, novalidate: f.noValidate, valid, focusOK, msg: msg.slice(0, 80), describedby: fields.filter((i) => i.getAttribute('aria-describedby')).length, live: !!f.querySelector('[role=alert],[aria-live]') });
  }
  return out;
}`;

// Same-page links (href="#id") whose target is absent from the hydrated DOM. Reads only; one record per distinct fragment, capped.
// A missing target is a snapshot observation: script routing or a deferred panel can mount it later, so the detector asks a person.
export const FRAGMENT_PROBE = `function () {
  const out = [], seen = new Set();
  for (const el of document.querySelectorAll('a[href^="#"]')) {
    if (out.length >= 20 || !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible') continue;
    const url = new URL(el.href, document.baseURI);
    if (url.href.split('#')[0] !== location.href.split('#')[0]) continue;
    let id; try { id = decodeURIComponent(url.hash.slice(1)); } catch { continue; }
    if (!id || id.toLowerCase() === 'top' || id.includes(':~:') || seen.has(id)) continue; seen.add(id);
    const target = document.getElementById(id) || [...document.getElementsByName(id)].find((n) => n.localName === 'a');
    out.push({ id, label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80), found: !!target });
  }
  return out;
}`;

// Passive page signals for the two tracks that sit outside the eight scored categories: answer-engine readiness (AEO) and security hygiene.
// Reads the document only: no requests, no clicks. Resource lists are capped so a heavy page stays cheap.
export const SIGNALS_PROBE = `function () {
  const q = (s) => document.querySelector(s);
  const meta = (n) => { const e = q('meta[name="' + n + '"]') || q('meta[property="' + n + '"]'); return e ? (e.content || '').trim() : null; };
  const ld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.textContent || ''); const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n['@type']) ld.push(...[].concat(n['@type']).map(String)); walk(n['@graph']); }; walk(j); } catch { ld.push('(invalid JSON-LD)'); }
  }
  const origin = location.origin;
  const mixed = [...document.querySelectorAll('script[src], link[rel=stylesheet][href], img[src], iframe[src], audio[src], video[src], source[src]')].map((e) => e.src || e.href || '').filter((u) => /^http:\\/\\//i.test(u)).slice(0, 10);
  const external = (u) => { try { return new URL(u, document.baseURI).origin !== origin; } catch { return false; } };
  const extScripts = [...document.querySelectorAll('script[src]')].filter((s) => external(s.src));
  const noSri = extScripts.filter((s) => !s.integrity).slice(0, 8).map((s) => s.src);
  const blank = [...document.querySelectorAll('a[target=_blank]')].filter((a) => external(a.href) && !/\\b(noopener|noreferrer)\\b/i.test(a.rel || '')).slice(0, 8).map((a) => a.href);
  const insecureForms = [...document.querySelectorAll('form[action]')].filter((f) => /^http:\\/\\//i.test(f.action)).slice(0, 5).map((f) => f.action);
  const pwd = [...document.querySelectorAll('input[type=password]')].length;
  const h1s = document.querySelectorAll('h1').length;
  const faq = [...document.querySelectorAll('h2, h3, h4, summary')].filter((h) => /\\?\\s*$/.test((h.textContent || '').trim())).length;
  return {
    title: document.title || null, lang: document.documentElement.lang || null, description: meta('description'), canonical: (q('link[rel=canonical]') || {}).href || null,
    robotsMeta: meta('robots'), og: { title: meta('og:title'), description: meta('og:description'), image: meta('og:image') }, jsonLdTypes: [...new Set(ld)], h1Count: h1s, questionHeadings: faq,
    isHttps: location.protocol === 'https:', mixed, extScriptCount: extScripts.length, extScriptsWithoutSri: noSri, blankWithoutNoopener: blank, insecureForms, passwordFields: pwd,
    fontFamilies: (() => { const m = {}; for (const e of document.querySelectorAll('h1,h2,h3,h4,p,li,a,button,label,span,td')) { if (!e.getClientRects().length) continue; const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join(' '); if (own.length < 4) continue; const f = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(); m[f] = (m[f] || 0) + own.length; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); })(),
    textWords: (document.body.innerText || '').trim().split(/\\s+/).filter(Boolean).length,
  };
}`;

// DIFF-002 hero layout (Avara detector pack, prototype-1): where the heading, the main action and the lead visual sit inside the first-screen hero,
// as fractions of the hero box. Geometry only. The main action comes from the scanner's own action probe (arg.action), and is left out when that
// probe found it covered, hidden or cut off; every element must be visible in the first screen and on top at its centre. Reads only; never clicks.
export const HERO_LAYOUT = `function (arg) {
  const vw = innerWidth, vh = innerHeight;
  const label = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')).slice(0, 80);
  const visible = (el) => { if (!el || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh; };
  const onTop = (el) => { const r = el.getBoundingClientRect(); const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1); const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
  const h1 = [...document.querySelectorAll('h1')].find((e) => visible(e) && onTop(e));
  if (!h1) return { skip: 'No visible main heading in the first screen, so no hero was identified.' };
  let hero = null;
  for (let p = h1.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { const r = p.getBoundingClientRect(); if (r.height > vh * 1.2 || r.top > vh * 0.5) break; if (p.querySelectorAll('h1').length > 1) break; hero = p; }
  if (!hero || !visible(hero)) return { skip: 'Hero outside first viewport or hidden' };
  const bounds = hero.getBoundingClientRect(); const features = {}; const elements = { hero: label(hero), heading: label(h1) }; const notes = [];
  const put = (name, el) => { const r = el.getBoundingClientRect(); features[name + 'X'] = (r.left + r.width / 2 - bounds.left) / bounds.width; features[name + 'Y'] = (r.top + r.height / 2 - bounds.top) / bounds.height; if (name === 'visual') { features.visualWidth = r.width / bounds.width; features.visualHeight = r.height / bounds.height; } elements[name] = label(el); };
  put('heading', h1);
  let action = null; let actionSource = null;
  if (arg && arg.action && arg.usable === false) notes.push('The main action was found covered, hidden or cut off by the action probe, so its position is not measured.');
  else if (arg && arg.action) { try { action = [...document.querySelectorAll(arg.action)].find((e) => hero.contains(e) && visible(e) && onTop(e)) || null; } catch { action = null; } if (action) actionSource = 'main action from the action probe'; else notes.push('The main action is not inside the hero.'); }
  else notes.push('The action probe found no main action.');
  if (action) put('action', action);
  const media = [...hero.querySelectorAll('img, picture, video, canvas, svg, figure, [role=img]')].filter((e) => !e.contains(h1) && !(action && e.contains(action)) && visible(e) && onTop(e) && e.getBoundingClientRect().width >= 96 && e.getBoundingClientRect().height >= 96);
  const visual = media.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; })[0];
  if (visual) put('visual', visual); else notes.push('No lead visual of at least 96 by 96 px is visible in the hero.');
  return { viewport: [vw, vh], features, elements, actionSource, notes };
}`;
