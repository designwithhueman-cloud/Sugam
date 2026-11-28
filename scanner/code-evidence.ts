// Evidence that a code patch is paste-ready, read in the page in the same state the finding was measured (never after a click or resize):
//   stable:  the shortest selector that matches exactly one element, and that element is the one measured. null when none does (for
//            example two banners that share .promo): a patch must not land on the wrong element.
//   naive:   how many elements the obvious class selector matches, so the fix can say why no code was given.
//   media:   the page's own rules (same-origin stylesheets) that set the given properties on this element, with their @media condition.
//            That is the project evidence for a breakpoint; a breakpoint Avara would otherwise have to guess is never emitted.
// A string, like the other in-page scripts, so the bundler cannot rewrite it before it runs in the page.
export type CodeEvidence = { found: boolean; stable: string | null; naive: { selector: string; count: number } | null; media: { media: string | null; prop: string; value: string }[]; unreadableSheets: number };

export const CODE_EVIDENCE = `function (arg) {
  const out = {};
  const ident = (s) => /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(s);
  // Class names that look generated (css-1x2y3z, sc-AbC12, jsx-123) change on every build: never offered as a stable selector.
  const generated = (c) => /^(css|sc|jsx|emotion|styled|tw)-/i.test(c) || /[0-9]{3,}/.test(c) || (/[A-Z]/.test(c) && /[0-9]/.test(c) && c.length > 6);
  const unique = (sel, el) => { try { const all = document.querySelectorAll(sel); return all.length === 1 && all[0] === el; } catch (e) { return false; } };
  const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch (e) { return 0; } };
  for (const t of arg.targets) {
    // The measured element itself when the caller has it; a selector only when it matches exactly one element (otherwise identity is unknown).
    let el = t.node || null;
    if (!el && t.selector) { try { const all = document.querySelectorAll(t.selector); el = all.length === 1 ? all[0] : null; } catch (e) { el = null; } }
    if (!el) { out[t.key] = { found: false, stable: null, naive: null, media: [], unreadableSheets: 0 }; continue; }
    const tag = el.localName; const classes = [...el.classList].filter((c) => ident(c) && !generated(c));
    const tries = [];
    if (el.id && ident(el.id) && !generated(el.id)) tries.push('#' + el.id);
    for (const c of classes) tries.push('.' + c, tag + '.' + c);
    for (let i = 0; i < classes.length; i++) for (let j = i + 1; j < classes.length; j++) tries.push(tag + '.' + classes[i] + '.' + classes[j]);
    // Only ids and class names: attribute selectors built from labels or test ids are not styling hooks and change with the copy.
    const stable = tries.filter((s) => s.length <= 48 && unique(s, el)).sort((a, b) => a.length - b.length)[0] || null;
    const naive = classes.length ? { selector: '.' + classes[0], count: count('.' + classes[0]) } : el.id ? { selector: '#' + el.id, count: count('#' + CSS.escape(el.id)) } : null;
    const media = []; let unreadable = 0;
    const walk = (rules, cond) => { for (const r of rules) {
      if (r.cssRules && r.media) { walk(r.cssRules, r.media.mediaText); continue; }
      if (r.cssRules && !r.selectorText) { walk(r.cssRules, cond); continue; }
      if (!r.selectorText) continue;
      let m = false; try { m = el.matches(r.selectorText); } catch (e) { m = false; }
      if (!m) continue;
      for (const p of t.props) { const v = r.style.getPropertyValue(p); if (v) media.push({ media: cond, prop: p, value: v.trim() }); }
    } };
    for (const sh of document.styleSheets) { let rules = null; try { rules = sh.cssRules; } catch (e) { unreadable++; continue; } if (rules) walk(rules, null); }
    out[t.key] = { found: true, stable, naive, media: media.slice(0, 20), unreadableSheets: unreadable };
  }
  return out;
}`;
