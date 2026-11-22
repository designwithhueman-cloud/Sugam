// The first screen's layout as plain data, for DIFF-002 (Visual Distinctiveness). Run at the top of the page, at the moment the first-screen screenshot is
// taken, so the features describe exactly the image that is compared. The same function runs on the scanned page and on every reference template
// (scripts/hero-references.ts), at the same 1280x800 viewport. Observations only: headline alignment, where the buttons sit, where the main image sits,
// a small label above the headline, the background tone, and the navigation shape. No requests, no clicks.
export const HERO_PROBE = `function () {
  const W = innerWidth, H = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.top < H; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const words = (s) => (s || '').replace(/\\s+/g, ' ').trim().split(' ').filter(Boolean).length;
  const lum = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c || ''); if (!m || (m[4] !== undefined && +m[4] < 0.5)) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]); };
  const bgAt = (e) => { for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/url\\(|gradient/.test(cs.backgroundImage)) return { kind: /gradient/.test(cs.backgroundImage) && !/url\\(/.test(cs.backgroundImage) ? 'gradient' : 'image', lum: lum(cs.backgroundColor) }; const l = lum(cs.backgroundColor); if (l != null) return { kind: 'solid', lum: l }; } return { kind: 'solid', lum: 1 }; };
  // the headline: the visible h1, or failing that the largest text in the first screen
  let h1 = [...document.querySelectorAll('h1')].find(vis) || null;
  if (!h1) { let best = 0; for (const e of document.querySelectorAll('h2,p,div,span,a')) { if (!vis(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 3)) continue; const s = parseFloat(getComputedStyle(e).fontSize); if (s > best && e.getBoundingClientRect().top < H * 0.8) { best = s; h1 = e; } } if (best < 28) h1 = null; }
  const hb = h1 ? box(h1) : null;
  const centreX = hb ? hb.x + hb.w / 2 : 0; const ta = h1 ? getComputedStyle(h1).textAlign : '';
  const align = !hb ? 'none' : ta === 'center' || Math.abs(centreX - W / 2) < W * 0.06 && hb.w < W * 0.9 ? 'centre' : centreX < W / 2 ? 'left' : 'right';
  // buttons in the first screen, outside the navigation
  const ctaSel = 'button, a[role=button], a[class*=btn], a[class*=button], a[class*=cta], input[type=submit]';
  const ctas = [...document.querySelectorAll(ctaSel)].filter((e) => vis(e) && !e.closest('header, nav') && e.getBoundingClientRect().height >= 28 && e.getBoundingClientRect().top < H).slice(0, 6).map(box);
  const rowOf = (a) => a.length >= 2 && a.every((b) => Math.abs(b.y - a[0].y) < 12);
  const ctaPos = !ctas.length || !hb ? 'none' : ctas[0].y >= hb.y + hb.h - 4 ? (Math.abs(ctas[0].x + (rowOf(ctas) ? (ctas[ctas.length - 1].x + ctas[ctas.length - 1].w - ctas[0].x) : ctas[0].w) / 2 - W / 2) < W * 0.08 ? 'below headline, centred' : 'below headline, left') : ctas[0].x > hb.x + hb.w ? 'beside headline' : 'above headline';
  // the main image: the largest picture, video, canvas or big svg in the first screen
  const media = [...document.querySelectorAll('img, picture, video, canvas, svg, [style*=background-image]')].filter((e) => vis(e) && !e.closest('header, nav')).map((e) => ({ e, b: box(e) })).filter((m) => m.b.w * m.b.h >= W * H * 0.06).sort((a, b) => b.b.w * b.b.h - a.b.w * a.b.h)[0] || null;
  let mediaPos = 'none';
  if (media) { const m = media.b; const cover = m.w >= W * 0.8 && m.h >= H * 0.6; mediaPos = cover ? 'full-bleed behind text' : !hb ? 'only element' : m.y >= hb.y + hb.h + 20 && m.x < W / 2 && m.x + m.w > W / 2 ? 'below the text' : m.x + m.w / 2 > W / 2 && m.x > hb.x ? 'right of the text' : 'left of the text'; }
  const bgBehind = hb ? bgAt(h1) : { kind: 'solid', lum: 1 }; if (bgBehind.kind === 'image' && mediaPos === 'none') mediaPos = 'full-bleed behind text';
  // a small rounded label above the headline
  const pill = hb ? [...document.querySelectorAll('span,div,a,p,small')].some((e) => { if (!vis(e) || e.contains(h1)) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.bottom <= hb.y + 4 && r.top >= hb.y - 160 && r.height >= 16 && r.height <= 44 && r.width < W * 0.5 && words(e.innerText) >= 1 && words(e.innerText) <= 10 && parseFloat(cs.borderTopLeftRadius) >= r.height / 2 - 2 && (lum(cs.backgroundColor) != null || parseFloat(cs.borderTopWidth) > 0); }) : false;
  const navEl = [...document.querySelectorAll('header, nav')].find((e) => vis(e) && e.getBoundingClientRect().top < 120) || null;
  const navLinks = navEl ? [...navEl.querySelectorAll('a')].filter(vis).length : 0;
  const navCta = navEl ? [...navEl.querySelectorAll(ctaSel)].some((e) => vis(e) && lum(getComputedStyle(e).backgroundColor) != null) : false;
  const tone = bgBehind.kind === 'image' ? 'photo' : bgBehind.kind === 'gradient' ? 'gradient' : bgBehind.lum < 0.2 ? 'dark' : 'light';
  const layout = !hb ? 'no headline' : mediaPos === 'full-bleed behind text' ? 'headline over a full-bleed image' : mediaPos === 'right of the text' ? 'split: text left, image right' : mediaPos === 'left of the text' ? 'split: image left, text right' : align === 'centre' ? 'centred stack' : 'left-aligned stack';
  return {
    viewport: { width: W, height: H }, layout, headline: hb ? { align, box: hb, fontSize: Math.round(parseFloat(getComputedStyle(h1).fontSize)), lines: Math.max(1, Math.round(hb.h / (parseFloat(getComputedStyle(h1).lineHeight) || parseFloat(getComputedStyle(h1).fontSize) * 1.2))), words: words(h1.innerText) } : null,
    ctas: { count: ctas.length, row: rowOf(ctas), position: ctaPos, boxes: ctas.slice(0, 3) }, media: { position: mediaPos, box: media ? media.b : null }, pill, tone,
    nav: { present: !!navEl, links: navLinks, cta: navCta },
  };
}`;
