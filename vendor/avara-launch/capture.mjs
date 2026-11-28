// Run once on the scanner's existing page for each viewport. Selectors come from
// the host's section classifier or an owner's mapping, never from a model result.
export function capture(mapping) {
  function shown(el) {
    const box = el.getBoundingClientRect();
    return el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) &&
      box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth;
  }
  const find = (root, selector) => selector ? [...root.querySelectorAll(selector)].filter(shown) : [];
  const seen = new Set();
  const sections = [];
  for (const entry of mapping.sections ?? []) {
    for (const el of find(document, entry.selector)) {
      if (seen.has(el)) throw Error('Overlapping section selectors select the same element');
      seen.add(el);
      const cards = find(el, entry.cardSelector);
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      sections.push({el, kind:entry.kind, selector:entry.selector,
        layout:entry.layout ?? [style.display, style.gridTemplateColumns.split(' ').length,
          style.flexDirection, style.textAlign].join('/'),
        cards:cards.length, y:Math.round(box.top + scrollY)});
    }
  }
  sections.sort((a,b) => a.y-b.y);
  const tokens = {};
  for (const [role,selector] of Object.entries(mapping.components ?? {})) {
    const [el] = find(document, selector);
    if (!el) continue;
    const s = getComputedStyle(el);
    tokens[role] = [s.fontFamily,s.fontWeight,s.color,s.backgroundColor,s.borderRadius];
  }
  const located = selector => find(document,selector).map(el => {
    const r = el.getBoundingClientRect();
    return {selector,y:Math.round(r.top+scrollY),bottom:Math.round(r.bottom+scrollY),
      width:Math.round(r.width),height:Math.round(r.height)};
  });
  return {viewport:[innerWidth,innerHeight],pageType:mapping.pageType,
    sections:sections.map(({el,...data})=>data),tokens,
    goals:located(mapping.goal), alternatives:located(mapping.alternative),
    claims:located(mapping.claim), proof:located(mapping.proof),
    proofMapped:Boolean(mapping.proof), brandCues:located(mapping.brandCue)};
}
