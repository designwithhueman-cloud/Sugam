// Scripts evaluated inside the scanned page. Kept as plain-JavaScript strings so they are
// never altered by TypeScript or bundler transforms before reaching the browser.

const HELPERS = String.raw`
const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
function selectorOf(el) {
  if (!(el instanceof Element)) return '';
  if (el.id && document.querySelectorAll('#' + cssEsc(el.id)).length === 1) return '#' + cssEsc(el.id);
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
    if (n !== el && n.id && document.querySelectorAll('#' + cssEsc(n.id)).length === 1) { parts.unshift('#' + cssEsc(n.id)); break; }
    let seg = n.localName;
    const p = n.parentElement;
    if (p) { const same = [...p.children].filter((c) => c.localName === n.localName); if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(n) + 1) + ')'; }
    parts.unshift(seg);
  }
  if (parts[0] && parts[0][0] !== '#') parts.unshift('html');
  return parts.join(' > ');
}
function htmlOf(el, max = 700) {
  const h = el.outerHTML || '';
  return h.length > max ? h.slice(0, max) + ' …' : h;
}
function visible(el) {
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"],[hidden],[inert]');
}
function accName(el) {
  const lb = el.getAttribute('aria-labelledby');
  if (lb) { const t = lb.split(/\s+/).map((id) => { const x = document.getElementById(id); return x ? x.textContent : ''; }).join(' ').trim(); if (t) return t; }
  const al = (el.getAttribute('aria-label') || '').trim(); if (al) return al;
  if (el.localName === 'input') return (el.value || el.getAttribute('alt') || '').trim();
  const clone = el.cloneNode(true);
  clone.querySelectorAll('[aria-hidden="true"],script,style').forEach((x) => x.remove());
  clone.querySelectorAll('img[alt]').forEach((img) => img.replaceWith(document.createTextNode(' ' + img.getAttribute('alt') + ' ')));
  const t = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  return t || (el.getAttribute('title') || '').trim();
}
function docBox(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height, visible: visible(el) };
}
`;

// Bounding boxes for a list of CSS selectors (axe targets and our own selectors).
export const BOXES = `(${String.raw`(sels) => { ${HELPERS}
  const out = {};
  for (const s of sels) { try { const el = document.querySelector(s); out[s] = el ? docBox(el) : null; } catch { out[s] = null; } }
  return out; }`})`;

export const PAGE_METRICS = `(() => {
  const d = document.documentElement, b = document.body;
  return { width: Math.max(d.scrollWidth, b ? b.scrollWidth : 0), height: Math.max(d.scrollHeight, b ? b.scrollHeight : 0), title: document.title, viewportWidth: innerWidth };
})`;

// Custom heuristics for AI-built / no-code sites.
export const HEURISTICS = `(${String.raw`(opts) => { ${HELPERS}
  const out = { duplicateCtas: [], clickables: [], tablists: [], reflow: null };
  const INTERACTIVE = 'a[href],button,[role=button],[role=link],input[type=button],input[type=submit],summary';

  // 1. Repeated ambiguous CTA labels ("Get started" x3 on a pricing grid)
  // A link and a button that share a label (a menu toggle and a footer link, say) are not the
  // same ambiguity, and two links to the same page (ignoring a trailing slash or #fragment) are
  // just repeated navigation. So: links are compared with links, buttons with buttons.
  const dest = (a) => { try { const u = new URL(a.href); return u.origin + u.pathname.replace(/\/+$/, '') + u.search; } catch { return a.getAttribute('href') || ''; } };
  const groups = new Map();
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!visible(el)) continue;
    const name = accName(el).toLowerCase();
    if (!name || name.length > 40) continue;
    const kind = el.localName === 'a' || el.getAttribute('role') === 'link' ? 'link' : 'button';
    const key = kind + '|' + name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  for (const [key, els] of groups) {
    if (els.length < 2) continue;
    if (key.startsWith('link|') && new Set(els.map(dest)).size < 2) continue;   // same destination: repeated nav, fine
    out.duplicateCtas.push({ name: accName(els[0]), nodes: els.slice(0, 30).map((e) => ({ selector: selectorOf(e), html: htmlOf(e), detail: e.localName === 'a' ? 'links to ' + e.getAttribute('href') : 'button' })) });
  }

  // 2. Non-semantic clickable elements
  const NONSEM = new Set(['div','span','li','p','img','svg','section','article','td','tr','i','h1','h2','h3','h4','h5','h6','ul','figure','header','footer']);
  const ROLES = new Set(['button','link','checkbox','menuitem','tab','switch','radio','option','combobox','textbox','slider','treeitem','gridcell']);
  const CONTAINERS = new Set(['tablist','menu','menubar','listbox','radiogroup','toolbar','grid','treegrid','tree','tabpanel','group','dialog','alertdialog','region','navigation']);
  const WRAPS = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex],[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[contenteditable=true]';
  const seen = new Set();
  const handlerOf = (el) => {
    if (el.hasAttribute('onclick')) return 'onclick attribute';
    for (const k of Object.keys(el)) {
      if (k.startsWith('__reactProps$') && el[k] && (typeof el[k].onClick === 'function' || typeof el[k].onMouseDown === 'function')) return 'React onClick handler';
      if (k === '_vei' && el[k] && (el[k].onClick || el[k].onclick)) return 'Vue click handler';
    }
    return null;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (out.clickables.length >= 60) break;
    if (!NONSEM.has(el.localName) || !visible(el)) continue;
    if (el.closest('a[href],button,summary,label,input,select,textarea,[role=button],[role=link]')) continue;
    // A wrapper around a real, focusable control (tooltip triggers, analytics, event delegation) is not a missing control.
    if (el.querySelector(WRAPS)) continue;
    const role = el.getAttribute('role'); const ti = el.getAttribute('tabindex');
    const focusable = ti !== null && Number(ti) >= 0;
    if (role && ROLES.has(role) && focusable) continue;
    // Members of a roving-tabindex group (radios, options, menu items) are reached with arrow keys, so tabindex="-1" is correct.
    if (role && ROLES.has(role) && el.closest('[role=radiogroup],[role=listbox],[role=menu],[role=menubar],[role=tree],[role=treegrid],[role=grid],[role=toolbar],[role=tablist]')) continue;
    // Composite widget containers (tablist, menu, listbox...) hold the controls; their handlers serve the children.
    if (role && CONTAINERS.has(role)) continue;
    const handler = handlerOf(el);
    const cursor = getComputedStyle(el).cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer');
    if (!handler && !cursor) continue;
    if ([...seen].some((s) => s.contains(el))) continue;
    seen.add(el);
    out.clickables.push({ confirmed: !!handler, selector: selectorOf(el), html: htmlOf(el), detail: (handler ? 'Has a ' + handler : 'Shows a pointer cursor') + ' but is a <' + el.localName + '>' + (role ? ' with role="' + role + '"' : ' with no role') + (focusable ? '' : ' and cannot be reached with Tab') + '.' });
  }

  // 3. ARIA tablists: structure (keyboard behaviour is tested by the scanner)
  for (const list of document.querySelectorAll('[role=tablist]')) {
    const tabs = [...list.querySelectorAll('[role=tab]')].filter((t) => t.closest('[role=tablist]') === list);
    const problems = [];
    if (!tabs.length) problems.push('The tablist contains no elements with role="tab".');
    if (!accName(list) && !list.getAttribute('aria-labelledby')) problems.push('The tablist has no accessible name (aria-label or aria-labelledby).');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    if (tabs.length && selected.length !== 1) problems.push(selected.length ? 'More than one tab has aria-selected="true".' : 'No tab has aria-selected="true".');
    const noSel = tabs.filter((t) => !t.hasAttribute('aria-selected'));
    if (noSel.length) problems.push(noSel.length + ' tab(s) have no aria-selected attribute.');
    const inactiveTabbable = tabs.filter((t) => t.getAttribute('aria-selected') !== 'true' && t.getAttribute('tabindex') !== '-1');
    if (tabs.length > 1 && inactiveTabbable.length) problems.push('Roving tabindex is missing: ' + inactiveTabbable.length + ' inactive tab(s) are in the Tab order (expected tabindex="-1").');
    for (const t of tabs) {
      const c = t.getAttribute('aria-controls');
      if (!c) { problems.push('A tab has no aria-controls pointing to its panel.'); break; }
      const panel = document.getElementById(c);
      if (!panel) { problems.push('aria-controls="' + c + '" points to an element that does not exist.'); break; }
      if (panel.getAttribute('role') !== 'tabpanel') { problems.push('The element #' + c + ' controlled by a tab does not have role="tabpanel".'); break; }
    }
    out.tablists.push({ selector: selectorOf(list), html: htmlOf(list, 900), problems, tabSelectors: tabs.map(selectorOf), selectedSelector: (selected[0] || tabs[0]) ? selectorOf(selected[0] || tabs[0]) : null });
  }

  // 4. Reflow at 320 CSS px (mobile pass only)
  if (opts && opts.reflow) {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    if (overflow > 1) {
      const EXEMPT = new Set(['table','pre','code','img','video','canvas','svg','iframe','map','picture']);
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        if (offenders.length >= 15) break;
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 1) continue;
        if (offenders.some((o) => o.el.contains(el))) continue;
        let sc = el.parentElement, scrolls = false;
        for (; sc && sc !== document.body; sc = sc.parentElement) { const ox = getComputedStyle(sc).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scrolls = true; break; } }
        if (scrolls) continue;
        offenders.push({ el, exempt: EXEMPT.has(el.localName) || !!el.closest('table,pre'), selector: selectorOf(el), html: htmlOf(el), detail: 'Extends to ' + Math.round(r.right) + 'px in a ' + vw + 'px-wide viewport (width ' + Math.round(r.width) + 'px).' });
      }
      out.reflow = { overflow, viewport: vw, offenders: offenders.map(({ el, ...o }) => o) };
    }
  }

  // 5. Speech in media: audio/video without a nearby transcript, and embedded players the scan cannot inspect
  out.media = [];
  const TRANSCRIPT = /transcript|captions? file|read the (text|script)|text version/i;
  const nearTranscript = (el) => {
    if ((el.getAttribute('aria-describedby') || '').trim()) return true;
    let box = el.parentElement;
    for (let up = 0; box && up < 3; up++, box = box.parentElement) {
      for (const a of box.querySelectorAll('a[href],button,details summary')) if (TRANSCRIPT.test(accName(a) + ' ' + (a.getAttribute('href') || ''))) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('audio, video')) {
    if (out.media.length >= 20) break;
    const isVideo = el.localName === 'video';
    // Silent background video (muted, autoplaying, no controls) carries no speech.
    if (isVideo && el.muted && el.autoplay && !el.controls) continue;
    if (isVideo && !visible(el)) continue;
    const tracks = [...el.querySelectorAll('track')].map((t) => (t.getAttribute('kind') || 'subtitles').toLowerCase());
    out.media.push({ kind: el.localName, captions: tracks.some((k) => k === 'captions' || k === 'subtitles'), transcript: nearTranscript(el), selector: selectorOf(el), html: htmlOf(el),
      detail: '<' + el.localName + '>' + (tracks.length ? ' with track kinds: ' + tracks.join(', ') : ' with no <track> elements') + (nearTranscript(el) ? '; a transcript link was found nearby.' : '; no transcript link found nearby.') });
  }
  const HOSTS = /(youtube(-nocookie)?\.com|youtu\.be|vimeo\.com|wistia\.(com|net)|loom\.com|vidyard\.com|spotify\.com|soundcloud\.com|podcasts\.apple\.com|anchor\.fm|buzzsprout\.com|twitch\.tv|tiktok\.com)/i;
  for (const f of document.querySelectorAll('iframe[src]')) {
    if (out.media.length >= 20) break;
    if (!visible(f) || !HOSTS.test(f.src)) continue;
    let host = ''; try { host = new URL(f.src).hostname; } catch {}
    out.media.push({ kind: 'embed', captions: null, transcript: nearTranscript(f), selector: selectorOf(f), html: htmlOf(f), detail: 'Embedded player from ' + host + (nearTranscript(f) ? '; a transcript link was found nearby.' : '; no transcript link found nearby.') });
  }
  return out; }`})`;

// Snapshot of the focused element during the keyboard trace.
export const FOCUS_SNAPSHOT = `(${String.raw`async () => { ${HELPERS}
  const host = document.activeElement;
  if (!host || host === document.body || host === document.documentElement) return { none: true };
  // Web components keep focus on the host; the ring is drawn on the element inside its shadow root.
  let el = host; while (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (el.localName === 'iframe') return { iframe: true, selector: selectorOf(el), html: htmlOf(el, 300) };
  const pick = (cs) => ({ outline: cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0 ? 'none' : cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, boxShadow: cs.boxShadow, border: cs.borderTopColor + ' ' + cs.borderTopWidth + ' ' + cs.borderBottomColor + ' ' + cs.borderBottomWidth, background: cs.backgroundColor, color: cs.color, decoration: cs.textDecorationLine, transform: cs.transform });
  const snap = (x) => x ? { self: pick(getComputedStyle(x)), before: pick(getComputedStyle(x, '::before')), after: pick(getComputedStyle(x, '::after')) } : null;
  const parent = el.parentElement;
  const focused = { el: snap(el), parent: parent ? pick(getComputedStyle(parent)) : null };
  el.blur();
  // Pages that style focus from a blur handler or framework state update a frame later; reading the
  // unfocused style too soon would make a working focus style look like "no change".
  await new Promise((done) => requestAnimationFrame(() => setTimeout(done, 40)));
  const unfocused = { el: snap(el), parent: parent ? pick(getComputedStyle(parent)) : null };
  el.focus({ preventScroll: true });
  const changed = [];
  for (const part of ['self', 'before', 'after']) for (const k of Object.keys(focused.el[part])) if (focused.el[part][k] !== unfocused.el[part][k]) changed.push((part === 'self' ? '' : '::' + part + ' ') + k);
  if (focused.parent) for (const k of Object.keys(focused.parent)) if (focused.parent[k] !== unfocused.parent[k]) changed.push('parent ' + k);
  const browserRing = focused.el.self.outline !== 'none' && focused.el.self.outline === unfocused.el.self.outline ? false : focused.el.self.outline !== 'none';

  // Is the focused element hidden behind fixed or sticky content? (WCAG 2.4.11)
  const r = host.getBoundingClientRect();
  const inView = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 && r.height > 0;
  let covered = 0, total = 0, by = null;
  if (inView) {
    const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]];
    for (const [fx, fy] of pts) {
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width * fx)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height * fy));
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      total++;
      if (hit === host || host.contains(hit) || hit.contains(host)) continue;
      let n = hit, fixed = null;
      for (; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') { fixed = n; break; } }
      if (fixed) { covered++; by = by || fixed; }
    }
  }
  return {
    selector: selectorOf(host), tag: el.localName, role: el.getAttribute('role'), name: accName(el).slice(0, 80), html: htmlOf(host, 400),
    box: docBox(host), inView,
    indicator: changed.length > 0 || browserRing, changed, focusStyle: focused.el.self,
    obscured: !inView ? 'offscreen' : covered === 0 ? 'none' : covered >= total ? 'full' : 'partial',
    obscuredBy: by ? { selector: selectorOf(by), html: htmlOf(by, 300), box: docBox(by), position: getComputedStyle(by).position } : null,
  }; }`})`;

// Running animations once the user prefers reduced motion (WCAG 2.2.2 / 2.3.3).
export const MOTION = `(${String.raw`() => { ${HELPERS}
  let readable = 0, unreadable = 0, hasRule = false;
  for (const sheet of document.styleSheets) {
    try { const txt = [...sheet.cssRules].map((r) => r.cssText).join('\n'); readable++; if (/prefers-reduced-motion/.test(txt)) hasRule = true; } catch { unreadable++; }
  }
  const running = [];
  const anims = document.getAnimations ? document.getAnimations() : [];
  for (const a of anims) {
    if (running.length >= 20) break;
    if (a.playState !== 'running' || !a.effect || !a.effect.target) continue;
    const t = a.effect.getComputedTiming();
    const long = t.iterations === Infinity || (Number(t.endTime) || 0) > 5000;
    if (!long) continue;
    const el = a.effect.target instanceof Element ? a.effect.target : null;
    if (!el || !visible(el)) continue;
    running.push({ selector: selectorOf(el), html: htmlOf(el, 300), detail: (a.animationName ? 'CSS animation "' + a.animationName + '"' : a.transitionProperty ? 'CSS transition' : 'Web animation') + (t.iterations === Infinity ? ', repeats forever' : ', runs ' + Math.round(t.endTime / 1000) + 's') });
  }
  return { hasReducedMotionRule: hasRule, readableSheets: readable, unreadableSheets: unreadable, running }; }`})`;

// Extra WCAG checks that axe-core does not run: non-text contrast (1.4.11), text spacing (1.4.12),
// dragging with no alternative (2.5.7), accessible authentication (3.3.8) and positive tabindex (2.4.3).
// Everything it changes (the text-spacing style, the test paste event) is undone or has no effect on the page.
export const EXTRA = `(${String.raw`(opts) => { ${HELPERS}
  const out = { nonTextContrast: [], textSpacing: [], dragging: [], authentication: { passwordFields: 0, pasteBlocked: [], autocompleteOff: [], captcha: [] }, positiveTabindex: [], smallText: [], autofocus: [], newTab: [], headings: [], vagueLinks: [], placeholderOnly: [], noMain: [], autoplayVideo: [], voiceNameNotFirst: [], forcedColorsOptOut: [], imageOfText: [], autocompleteMissing: [], requiredNotMarked: [], radioGroups: [], invalidNoMessage: [], labelNotVisible: [], inputTypeMismatch: [] };
  const ref = (el, detail) => ({ selector: selectorOf(el), html: htmlOf(el, 400), detail });

  // --- colour helpers: any CSS colour is normalised through a 1x1 canvas ---
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { try { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; } catch { return null; } };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // The opaque colour behind an element, or null when an image or gradient makes it unknowable.
  const backdrop = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor); if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  // --- 1.4.11: a text field needs a visible boundary of at least 3:1 against what is behind it ---
  const FIELD = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),select,textarea';
  const boundary = (el) => {
    const cs = getComputedStyle(el); const behind = backdrop(el); if (!behind) return { unknown: true };
    let best = 0;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (cs['border' + side + 'Style'] === 'none' || cs['border' + side + 'Style'] === 'hidden' || parseFloat(cs['border' + side + 'Width']) < 1) continue;
      const c = rgba(cs['border' + side + 'Color']); if (c && c.a > 0.1) best = Math.max(best, ratio(c, behind));
    }
    const bg = rgba(cs.backgroundColor); if (bg && bg.a > 0.9) best = Math.max(best, ratio(bg, behind));
    if (cs.boxShadow && cs.boxShadow !== 'none') best = Math.max(best, 3);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: true };
    return { best };
  };
  for (const f of [...document.querySelectorAll(FIELD)].filter((e) => visible(e) && !e.disabled).slice(0, 60)) {
    let ok = false, unknown = false, best = 0;
    // The field itself, or a wrapper drawn around it (up to three levels), can carry the boundary.
    for (let e = f, depth = 0; e && e !== document.body && depth < 4; e = e.parentElement, depth++) {
      if (depth > 0) { const r = e.getBoundingClientRect(), fr = f.getBoundingClientRect(); if (r.height > fr.height * 3 + 24 || r.width > fr.width * 4 + 80) break; }
      const b = boundary(e);
      if (b.unknown) { unknown = true; break; }
      best = Math.max(best, b.best); if (b.best >= 3) { ok = true; break; }
    }
    if (!ok && !unknown) out.nonTextContrast.push(ref(f, 'The field boundary has a contrast of about ' + best.toFixed(1) + ':1 against the background; WCAG 1.4.11 asks for at least 3:1.'));
  }

  // --- 2.5.7: things that can only be dragged ---
  const seen = new Set();
  for (const el of document.querySelectorAll('[draggable="true"],[class*="sortable"],[class*="draggable"],[class*="drag-handle"],[class*="dnd-"],[class*="kanban"]')) {
    if (out.dragging.length >= 12 || !visible(el) || seen.has(el)) continue; seen.add(el);
    if (el.matches('img,a,svg')) continue; // draggable by default and rarely the only way to do something
    out.dragging.push(ref(el, el.getAttribute('draggable') === 'true' ? 'draggable="true"' : 'A class name suggests drag and drop (' + (String(el.className).match(/[\w-]*(?:sortable|draggable|drag-handle|dnd-|kanban)[\w-]*/) || [''])[0] + ')'));
  }

  // --- 3.3.8: no cognitive test to sign in: paste and password managers must work ---
  const pw = [...document.querySelectorAll('input[type=password]')].filter(visible);
  out.authentication.passwordFields = pw.length;
  for (const p of pw.slice(0, 6)) {
    const form = p.form || p.closest('form') || document;
    const user = [...form.querySelectorAll('input[type=email],input[type=text],input:not([type])')].find(visible);
    for (const field of user ? [user, p] : [p]) {
      let blocked = false;
      try { blocked = !field.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })); } catch { /* ignore */ }
      if (blocked) out.authentication.pasteBlocked.push(ref(field, 'A page script cancels the paste event on this field.'));
      const ac = (field.getAttribute('autocomplete') || '').toLowerCase();
      if (ac === 'off' || ac === 'nope') out.authentication.autocompleteOff.push(ref(field, 'autocomplete="' + ac + '" asks the browser not to fill this field.'));
    }
    if (!out.authentication.captcha.length) for (const c of document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="arkoselabs"],iframe[src*="funcaptcha"],.g-recaptcha,.h-captcha,img[alt*="captcha" i],input[name*="captcha" i]')) {
      if (out.authentication.captcha.length < 3) out.authentication.captcha.push(ref(c, 'A CAPTCHA appears on a page with a password field.'));
    }
  }

  // --- 2.4.3: a positive tabindex forces an order that differs from the page ---
  for (const el of document.querySelectorAll('[tabindex]')) {
    if (out.positiveTabindex.length >= 12) break;
    if (Number(el.getAttribute('tabindex')) > 0 && visible(el)) out.positiveTabindex.push(ref(el, 'tabindex="' + el.getAttribute('tabindex') + '"'));
  }

  // --- 1.4.12: apply the WCAG text-spacing values and see what gets clipped that was not before ---
  if (opts.textSpacing) {
    const cands = [...document.body.querySelectorAll('*')].filter((el) => {
      if (!visible(el)) return false;
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) return false;
      if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '') return false;
      return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || el.querySelector('p,span,a,li,h1,h2,h3,h4,h5,h6,button,label');
    }).slice(0, 400);
    const clipped = (el) => { const cs = getComputedStyle(el); return (/(hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) || (/(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2); };
    const before = new Set(cands.filter(clipped));
    const style = document.createElement('style');
    style.textContent = '*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important}p{margin-bottom:2em !important}';
    document.head.appendChild(style); void document.body.offsetHeight;
    try { for (const el of cands) { if (out.textSpacing.length < 10 && !before.has(el) && clipped(el)) out.textSpacing.push(ref(el, 'With WCAG text-spacing values applied, text in this box is cut off (content ' + el.scrollHeight + 'px tall in a ' + el.clientHeight + 'px box).')); } }
    finally { style.remove(); }
  }

  // =====================================================================================================
  // Checks aimed at sites built with AI builders. Grouped by the six ways people use the web.
  // =====================================================================================================
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // ZOOM -- very small text is the first thing that breaks when someone zooms or has low vision.
  { const seenText = new Set(); let n = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (n >= 12) break;
      if (!visible(el) || el.closest('sup,sub,script,style,noscript,svg')) continue;
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
      if (own.length < 4) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > 0 && fs < 12) { const key = Math.round(fs) + '|' + el.localName + '|' + String(el.className).slice(0, 40); if (seenText.has(key)) continue; seenText.add(key); n++; out.smallText.push(ref(el, 'Text is ' + fs.toFixed(1) + 'px tall: ' + own.slice(0, 50))); }
    } }

  // KEYBOARD -- autofocus steals the starting point; links that open a new tab surprise people who cannot see it happen.
  const signInPage = [...document.querySelectorAll('input[type=password]')].some(visible); // a dedicated sign-in page may focus its first field
  for (const el of document.querySelectorAll('[autofocus]')) if (!signInPage && out.autofocus.length < 6 && visible(el) && !el.closest('dialog,[role=dialog],[aria-modal=true]')) out.autofocus.push(ref(el, 'autofocus moves keyboard focus here as soon as the page loads.'));
  for (const a of document.querySelectorAll('a[href][target=_blank]')) {
    if (out.newTab.length >= 12 || !visible(a)) continue;
    const label = norm(accName(a) + ' ' + (a.getAttribute('title') || '') + ' ' + (a.getAttribute('aria-describedby') ? (document.getElementById(a.getAttribute('aria-describedby')) || { textContent: '' }).textContent : ''));
    if (!/(new (tab|window)|opens? in|external|opens a new)/.test(label)) out.newTab.push(ref(a, 'target="_blank" with no warning in the link text.'));
  }

  // SCREEN READERS -- headings, landmarks, link text, form labels.
  { const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter(visible);
    const lvl = (h) => (h.localName.length === 2 && /^h[1-6]$/.test(h.localName) ? Number(h.localName[1]) : Number(h.getAttribute('aria-level')) || 2);
    const h1s = hs.filter((h) => lvl(h) === 1);
    if (!h1s.length) out.headings.push({ kind: 'no-h1', ...ref(document.querySelector('main,[role=main]') || document.body, 'The page has no level-1 heading.') });
    h1s.slice(1, 4).forEach((h) => out.headings.push({ kind: 'many-h1', ...ref(h, 'This is level-1 heading number ' + (h1s.indexOf(h) + 1) + ' on the page.') }));
    let prev = 0;
    for (const h of hs) { const l = lvl(h); if (prev && l > prev + 1 && out.headings.length < 12) out.headings.push({ kind: 'skipped', ...ref(h, 'Jumps from h' + prev + ' to h' + l + ': ' + norm(h.textContent).slice(0, 50)) }); prev = l; }
    for (const h of hs) if (!accName(h) && out.headings.length < 14) out.headings.push({ kind: 'empty', ...ref(h, 'An empty heading is announced as a heading with no name.') }); }
  if (!document.querySelector('main,[role=main]')) out.noMain.push(ref(document.body, 'No <main> element or role="main".'));
  { const VAGUE = new Set(['click here', 'here', 'click', 'link', 'this link', 'this', 'more', 'details', 'go', 'url']);
    for (const a of document.querySelectorAll('a[href],[role=link]')) { if (out.vagueLinks.length >= 12 || !visible(a)) continue; if (VAGUE.has(norm(accName(a)).replace(/[.>»→]+$/g, '').trim())) out.vagueLinks.push(ref(a, 'The link is announced as "' + norm(accName(a)) + '" with no hint where it goes.')); } }
  for (const f of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=image]):not([type=range]):not([type=file]),textarea')) {
    if (out.placeholderOnly.length >= 10 || !visible(f) || !f.getAttribute('placeholder')) continue;
    if ((f.labels && f.labels.length) || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) continue;
    out.placeholderOnly.push(ref(f, 'Only the placeholder "' + f.getAttribute('placeholder').slice(0, 40) + '" says what to type; it vanishes once you start typing.'));
  }

  // CAPTIONS AND MOTION -- autoplaying video that cannot be paused.
  for (const v of document.querySelectorAll('video[autoplay]')) {
    if (out.autoplayVideo.length >= 6 || !visible(v) || v.hasAttribute('controls')) continue;
    if (v.loop || !(v.duration > 0) || v.duration > 5) out.autoplayVideo.push(ref(v, 'Autoplays' + (v.loop ? ' and loops' : '') + ' with no controls, so it cannot be paused.'));
  }

  // VOICE CONTROL -- the spoken name should start with the words on screen (WCAG 2.5.3 asks that it contains them).
  for (const el of document.querySelectorAll('a[href][aria-label],button[aria-label],[role=button][aria-label]')) {
    if (out.voiceNameNotFirst.length >= 12 || !visible(el)) continue;
    const vis = norm([...el.childNodes].map((c) => c.nodeType === 3 || (c.nodeType === 1 && !c.getAttribute('aria-hidden')) ? c.textContent : '').join(' ')); const nm = norm(el.getAttribute('aria-label'));
    if (vis.length >= 3 && nm.includes(vis) && !nm.startsWith(vis)) out.voiceNameNotFirst.push(ref(el, 'On screen: "' + vis.slice(0, 40) + '". Spoken name: "' + nm.slice(0, 60) + '".'));
  }

  // HIGH CONTRAST -- forced-color-adjust: none switches off the operating system's high-contrast colours.
  { let n = 0; for (const el of document.body.querySelectorAll('*')) { if (n >= 8) break; if (!visible(el) || el.closest('svg')) continue; if (getComputedStyle(el).forcedColorAdjust === 'none' && (el.matches('a,button,input,select,textarea,[role=button]') || norm(el.textContent).length > 3)) { n++; out.forcedColorsOptOut.push(ref(el, 'forced-color-adjust: none on this element.')); } } }
  // =====================================================================================================
  // IMAGES OF TEXT (1.4.5) and FORM FIELDS (1.3.1, 1.3.5, 3.3.1, 3.3.2, 2.4.6)
  // =====================================================================================================
  // Images of text cannot be read by scanning pixels here, so this looks for the signals AI builders and designers leave:
  // a file name that says it is a heading, button or banner, a wide strip of an image with a sentence for alt text, or a
  // button that is a picture. Logos are exempt in WCAG, and photos with long alt text are NOT flagged on length alone.
  { const HINT = /(headline|heading|title|banner|slogan|tagline|quote|button|btn|cta|text|caption|label)/i;
    const LOGO = /(logo|brand|wordmark|favicon|icon)/i;
    const fileOf = (u) => { try { return decodeURIComponent(new URL(u, location.href).pathname.split('/').pop() || ''); } catch { return ''; } };
    for (const img of document.querySelectorAll('img')) {
      if (out.imageOfText.length >= 10 || !visible(img)) continue;
      const r = img.getBoundingClientRect(); if (r.width < 90 || r.height < 18) continue;
      const alt = (img.getAttribute('alt') || '').trim(); const file = fileOf(img.currentSrc || img.src);
      if (!alt || LOGO.test(alt + ' ' + file + ' ' + img.className) || img.closest('[class*=logo],[class*=brand]')) continue;
      const words = alt.split(/\s+/).length; const aspect = r.width / r.height;
      const inControl = !!img.closest('a[href],button,[role=button]');
      const why = HINT.test(file) && words >= 1 ? 'the file is called "' + file + '"'
        : inControl && aspect >= 2.2 && words <= 6 && HINT.test(file + ' ' + img.className) ? 'a wide picture used as a button'
        : aspect >= 4 && words >= 3 ? 'a very wide strip with a sentence as its alt text' : '';
      if (why) out.imageOfText.push(ref(img, 'Possible text inside an image (' + why + '). Alt text: "' + alt.slice(0, 60) + '".'));
    }
    for (const el of document.body.querySelectorAll('[style*="background"],[class]')) {
      if (out.imageOfText.length >= 10 || !visible(el) || el.localName === 'img' || (el.textContent || '').trim()) continue;
      const bg = getComputedStyle(el).backgroundImage; const m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/); if (!m) continue;
      const file = fileOf(m[1]); const r = el.getBoundingClientRect(); const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
      if (r.width >= 90 && r.height >= 18 && HINT.test(file) && !LOGO.test(file) && (label || el.getAttribute('role') === 'img'))
        out.imageOfText.push(ref(el, 'A background image called "' + file + '" with no real text inside (' + (label || 'role=img') + ').'));
    } }

  // --- form fields ---
  const FIELDS = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=range]):not([type=file]):not([type=color]),select,textarea')].filter((f) => visible(f) && !f.disabled);
  const labelText = (f) => norm([...(f.labels || [])].map((l) => l.textContent).join(' '));
  const hintOf = (f) => (f.name + ' ' + f.id + ' ' + labelText(f) + ' ' + (f.getAttribute('aria-label') || '') + ' ' + (f.getAttribute('placeholder') || '')).toLowerCase();
  const PURPOSE = [[/e-?mail/, 'email'], [/(phone|mobile|\btel\b|telephone)/, 'tel'], [/(first|given).?name|forename/, 'given-name'], [/(last|family).?name|surname/, 'family-name'], [/(zip|postal|post.?code)/, 'postal-code'], [/(street|address.?line|address1)/, 'street-address'], [/\bcity\b|\btown\b/, 'address-level2'], [/(card|cc).?(number|num)/, 'cc-number']];
  for (const f of FIELDS) {
    if (f.type === 'checkbox' || f.type === 'radio' || f.type === 'search' || f.localName === 'select') continue;
    const h = hintOf(f); const ac = (f.getAttribute('autocomplete') || '').trim().toLowerCase();
    // 1.3.5: fields that collect the user's own details should say what they are, so the browser can fill them.
    if (!ac && out.autocompleteMissing.length < 10 && !/(recipient|friend|referral|gift|their|company|business)/.test(h)) {
      const hit = f.type === 'password' ? ['x', f.closest('form') && /(sign.?up|register|create|new)/i.test(f.closest('form').textContent.slice(0, 600)) ? 'new-password' : 'current-password'] : PURPOSE.find(([re]) => re.test(h));
      if (hit) out.autocompleteMissing.push(ref(f, 'No autocomplete attribute. This looks like a "' + hit[1] + '" field; add autocomplete="' + hit[1] + '".'));
    }
    // Wrong input type: the phone keyboard and built-in checks only appear for the right type.
    if ((f.type === 'text' || !f.getAttribute('type')) && f.localName === 'input' && out.inputTypeMismatch.length < 8 && !/(user.?name|login|\bor\b)/.test(h)) { // "Username or email" legitimately takes either
      if (/e-?mail/.test(h)) out.inputTypeMismatch.push(ref(f, 'type="text" on what looks like an email field; use type="email".'));
      else if (/(phone|mobile|\btel\b|telephone)/.test(h)) out.inputTypeMismatch.push(ref(f, 'type="text" on what looks like a phone field; use type="tel".'));
    }
    // 3.3.2: a star in the label but nothing in the markup says the field is required.
    const lt = labelText(f) + ' ' + norm(f.getAttribute('aria-label'));
    if (/(\*|\(required\)|\brequired\b)/i.test(lt) && !f.required && f.getAttribute('aria-required') !== 'true' && out.requiredNotMarked.length < 10)
      out.requiredNotMarked.push(ref(f, 'The label says the field is required, but the field has no required or aria-required attribute.'));
    // 3.3.1: marked invalid but no error text is connected to it.
    if (f.getAttribute('aria-invalid') === 'true' && out.invalidNoMessage.length < 8) {
      const ids = ((f.getAttribute('aria-describedby') || '') + ' ' + (f.getAttribute('aria-errormessage') || '')).trim().split(/\s+/).filter(Boolean);
      if (!ids.some((id) => (document.getElementById(id) || { textContent: '' }).textContent.trim())) out.invalidNoMessage.push(ref(f, 'aria-invalid="true" but no aria-describedby / aria-errormessage points to error text.'));
    }
    // 2.4.6 / 3.3.2: the only name is hidden (aria-label or title); nothing on screen says what the field is.
    if (!(f.labels && f.labels.length) && !f.getAttribute('aria-labelledby') && !f.getAttribute('placeholder') && (f.getAttribute('aria-label') || f.getAttribute('title')) && out.labelNotVisible.length < 10)
      out.labelNotVisible.push(ref(f, 'Named "' + (f.getAttribute('aria-label') || f.getAttribute('title')).slice(0, 40) + '" for assistive technology only; nothing on screen labels it.'));
  }
  // 1.3.1: radio buttons and checkboxes that belong together need a group with a name.
  { const byName = new Map();
    for (const f of document.querySelectorAll('input[type=radio][name],input[type=checkbox][name]')) { if (!visible(f)) continue; const k = f.type + '|' + (f.form ? 'f' : 'd') + '|' + f.name; (byName.get(k) || byName.set(k, []).get(k)).push(f); }
    for (const [k, list] of byName) {
      if (list.length < 2 || out.radioGroups.length >= 8) continue;
      const grp = list[0].closest('fieldset,[role=radiogroup],[role=group]');
      const shared = grp && list.every((f) => grp.contains(f));
      const named = shared && (grp.localName === 'fieldset' ? !!(grp.querySelector(':scope > legend') && grp.querySelector(':scope > legend').textContent.trim()) || !!grp.getAttribute('aria-label') || !!grp.getAttribute('aria-labelledby') : !!(grp.getAttribute('aria-label') || grp.getAttribute('aria-labelledby')));
      if (!named) out.radioGroups.push(ref(list[0], list.length + ' ' + (k.startsWith('radio') ? 'radio buttons' : 'checkboxes') + ' named "' + list[0].name + '" ' + (shared ? 'are in a group with no name.' : 'are not wrapped in a fieldset with a legend.')));
    } }
  return out; }`})`;
