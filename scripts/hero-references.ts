// Builds and calibrates the DIFF-002 reference set (data/hero-references/).
//   1. Serves the cloned templates (.data/hero-templates, see data/hero-references/sources.json) and the project fixtures on a local port.
//   2. Captures each first screen at the scanner's desktop viewport (1280x800), after the scanner's own settle step, as a JPEG at the scan's quality,
//      and measures its layout with the same hero probe a scan uses.
//   3. Embeds every screenshot with DINOv2 (worker/vision/embed.py, cached by image hash and model version).
//   4. Calibrates on labelled pairs: each reference re-captured with different branding (hue, typeface, headline and brand name changed) is a
//      positive for its own reference; each reference's nearest OTHER reference, and each rebrand's nearest non-origin reference, are negatives.
//      A threshold is "validated" only if it lets no negative through and finds at least 80% of the positives.
// Writes manifest.json, embeddings.json, calibration.json and screenshots/<id>.jpg. Run: node --experimental-strip-types scripts/hero-references.ts
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { VIEWPORTS, settle } from '../scanner/scanner.ts';
import { HERO_PROBE } from '../scanner/hero-probe.ts';
import { embed, sha256, rank, MODEL_ID, type ReferenceSet } from '../src/services/vision/hero-match.ts';
import type { HeroLayout, ReferenceInfo } from '../src/services/vision/hero-layout.ts';

const ROOT = process.cwd(); const OUT = path.join(ROOT, 'data', 'hero-references'); const TPL = path.join(ROOT, '.data', 'hero-templates'); const FIX = path.join(ROOT, 'fixture', 'site');
type Source = { id: string; name: string; kind: 'template' | 'fixture'; origin: string; license: string; ownership: string; path: string; source: { repo?: string; commit?: string } };
const sources = (JSON.parse(fs.readFileSync(path.join(OUT, 'sources.json'), 'utf8')) as { references: Source[] }).references;
// Clone any missing template at its recorded commit (MIT-licensed public repositories).
for (const s of sources) {
  const dir = path.join(TPL, s.path.split('/')[2]); if (!s.source.repo || fs.existsSync(dir)) continue; fs.mkdirSync(TPL, { recursive: true });
  execFileSync('git', ['clone', '-q', s.source.repo, dir]); execFileSync('git', ['-C', dir, 'checkout', '-q', s.source.commit!]);
}
const VP = VIEWPORTS.find((v) => v.name === 'desktop')!;
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); const base = u.startsWith('/t/') ? TPL : u.startsWith('/f/') ? FIX : null;
  const file = base ? path.normalize(path.join(base, u.slice(3))) : ''; const ok = base && file.startsWith(base) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!ok) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); const port = (server.address() as { port: number }).port;

// Different branding, same template: a new hue, a serif typeface, a new headline of the same length and a new brand name.
async function rebrand(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.filter = 'hue-rotate(150deg) saturate(0.85)';
    const st = document.createElement('style'); st.textContent = 'body, body * { font-family: Georgia, "Times New Roman", serif !important; }'; document.head.appendChild(st);
    const h = document.querySelector('h1'); if (h) { const n = (h.textContent || '').length; const t = 'Fresh bread delivered to your door each and every single morning of the week'; h.textContent = t.slice(0, Math.max(8, n)); }
    const brand = document.querySelector('header a, nav a, .navbar-brand, header strong'); if (brand && brand.children.length === 0) brand.textContent = 'Fernhill';
  });
  await page.waitForTimeout(300);
}
async function capture(page: Page, url: string, variant: boolean): Promise<{ shot: Buffer; layout: HeroLayout }> {
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 }); await settle(page); if (variant) await rebrand(page);
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  const shot = await page.screenshot({ type: 'jpeg', quality: 70 }); const layout = (await page.evaluate(`(${HERO_PROBE})()`)) as HeroLayout; return { shot, layout };
}

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: VP.width, height: VP.height } }); const page = await ctx.newPage();
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true }); const varDir = path.join(ROOT, '.data', 'hero-variants'); fs.mkdirSync(varDir, { recursive: true });
const refs: ReferenceInfo[] = []; const shots: Buffer[] = []; const variants: { id: string; shot: Buffer; layout: HeroLayout }[] = []; const failed: string[] = [];
for (const s of sources) {
  try {
    const url = `http://127.0.0.1:${port}${s.path}`; const a = await capture(page, url, false); const b = await capture(page, url, true);
    fs.writeFileSync(path.join(OUT, 'screenshots', `${s.id}.jpg`), a.shot); fs.writeFileSync(path.join(varDir, `${s.id}.rebrand.jpg`), b.shot);
    refs.push({ id: s.id, name: s.name, kind: s.kind, origin: s.origin, license: s.license, ownership: s.ownership, viewport: { width: VP.width, height: VP.height }, screenshot: `screenshots/${s.id}.jpg`, sha256: sha256(a.shot), layout: a.layout });
    shots.push(a.shot); variants.push({ id: s.id, ...b }); console.log(`captured ${s.id.padEnd(28)} ${a.layout.layout}`);
  } catch (e) { failed.push(`${s.id}: ${(e as Error).message.split('\n')[0]}`); console.log(`FAILED   ${s.id}  ${(e as Error).message.split('\n')[0]}`); }
}
await browser.close(); server.close();

const vecs = await embed(shots); const vvecs = await embed(variants.map((v) => v.shot));
const vectors = Object.fromEntries(refs.map((r, i) => [r.sha256, vecs[i]]));
const version = `${new Date().toISOString().slice(0, 10)}.${refs.length}`;
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version, createdAt: new Date().toISOString(), model: MODEL_ID, viewport: { width: VP.width, height: VP.height }, capture: 'scanner settle(), blur, scroll to top, JPEG quality 70, hero probe at the same moment', counts: { templates: refs.filter((r) => r.kind === 'template').length, fixtures: refs.filter((r) => r.kind === 'fixture').length, failed: failed.length }, failed, references: refs }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'embeddings.json'), JSON.stringify({ model: MODEL_ID, keyedBy: 'sha256 of the screenshot', vectors }) + '\n');

// ---- calibration on labelled pairs ----
const set: ReferenceSet = { version, model: MODEL_ID, viewport: { width: VP.width, height: VP.height }, references: refs, vectors, calibration: null };
type Pair = { query: string; target: string; label: 'same template, different branding' | 'different templates'; similarity: number; shared: number; differs: string[] };
const pairs: Pair[] = [];
refs.forEach((r, i) => { const c = rank(vecs[i], r.layout, set, 1, r.id)[0]; if (c) pairs.push({ query: r.id, target: c.id, label: 'different templates', similarity: c.similarity, shared: c.shared.length, differs: c.differs }); });
variants.forEach((v, i) => {
  const all = rank(vvecs[i], v.layout, set, refs.length); const own = all.find((c) => c.id === v.id); const other = all.find((c) => c.id !== v.id);
  if (own) pairs.push({ query: `${v.id} (rebranded)`, target: own.id, label: 'same template, different branding', similarity: own.similarity, shared: own.shared.length, differs: own.differs });
  if (other) pairs.push({ query: `${v.id} (rebranded)`, target: other.id, label: 'different templates', similarity: other.similarity, shared: other.shared.length, differs: other.differs });
});
const pos = pairs.filter((p) => p.label.startsWith('same')), neg = pairs.filter((p) => p.label === 'different templates');
const top1 = variants.filter((v, i) => rank(vvecs[i], v.layout, set, 1)[0]?.id === v.id).length;
let best: { minSimilarity: number; minShared: number; tp: number; fp: number; margin: number } | null = null;
for (let minShared = 0; minShared <= 7; minShared++) for (const p of pos) {
  const t = p.similarity; const tp = pos.filter((x) => x.similarity >= t && x.shared >= minShared).length; const fp = neg.filter((x) => x.similarity >= t && x.shared >= minShared).length;
  const margin = t - Math.max(0, ...neg.filter((x) => x.shared >= minShared).map((x) => x.similarity));
  if (fp === 0 && (!best || tp > best.tp || (tp === best.tp && margin > best.margin))) best = { minSimilarity: t, minShared, tp, fp, margin: Math.round(margin * 1000) / 1000 };
}
const validated = !!best && best.tp / pos.length >= 0.8 && best.margin > 0;
const threshold = best ? { minSimilarity: best.minSimilarity, minShared: best.minShared, validated, note: `${best.tp} of ${pos.length} rebranded positives pass, ${best.fp} of ${neg.length} negatives pass, margin ${best.margin} over the closest negative` } : null;
fs.writeFileSync(path.join(OUT, 'calibration.json'), JSON.stringify({ version, model: MODEL_ID, method: 'Zero false positives on the labelled negatives, then the most positives; validated only at 80% or more of positives with a positive margin.', retrievalTop1: `${top1} of ${variants.length} rebranded references retrieve their own template first`, threshold, pairs }, null, 1) + '\n');
console.log(JSON.stringify({ references: refs.length, failed, top1: `${top1}/${variants.length}`, threshold, maxNeg: Math.max(...neg.map((p) => p.similarity)), minPos: Math.min(...pos.map((p) => p.similarity)) }, null, 1));
process.exit(0);
