// DIFF-002 (Visual Distinctiveness), the image half: which reference template does this page's first screen resemble, and why?
// Runs in the scan worker (lib/jobs.ts), never in a report request. The first-screen screenshot is embedded with DINOv2 (facebookresearch/dinov2,
// ViT-S/14, pinned commit) by worker/vision/embed.py, locally; vectors are cached by image hash and model version. The nearest references are then
// explained with layout features measured the same way on both pages (scanner/hero-probe.ts). A nearest match always exists, so a match is only
// "surfaced" when it clears a threshold validated on labelled pairs (data/hero-references/calibration.json); otherwise it stays diagnostic.
// Anything missing (capture, layout, references, Python, model) returns an explicit skip reason instead of a guess.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ScanOutput } from '../../../scanner/scanner.ts';
import { compareLayouts, type Candidate, type HeroLayout, type HeroMatch, type ReferenceInfo } from './hero-layout.ts';

export const MODEL_ID = 'facebookresearch/dinov2@4d83ffd:dinov2_vits14';
const root = () => process.cwd();
export const REF_DIR = () => process.env.AVARA_HERO_REFS || path.join(/*turbopackIgnore: true*/ root(), 'data', 'hero-references');
const CACHE_DIR = () => path.join(/*turbopackIgnore: true*/ process.env.AVARA_VISION_CACHE || path.join(/*turbopackIgnore: true*/ root(), '.data', 'vision-cache'), MODEL_ID.replace(/[^a-z0-9]+/gi, '_'));
const PYTHON = () => process.env.AVARA_VISION_PYTHON || path.join(/*turbopackIgnore: true*/ root(), 'worker', 'vision', '.venv', 'bin', 'python');
const SCRIPT = () => path.join(/*turbopackIgnore: true*/ root(), 'worker', 'vision', 'embed.py');
export const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

export class VisionError extends Error { skip: 'model_unavailable' | 'model_failed' | 'model_mismatch'; constructor(skip: VisionError['skip'], m: string) { super(m); this.skip = skip; } }

/** Embeds images with DINOv2. Cached per image hash and model version, so a reference or a repeated scan is never embedded twice. */
export async function embed(images: Buffer[]): Promise<number[][]> {
  const dir = CACHE_DIR(); fs.mkdirSync(dir, { recursive: true });
  const keys = images.map(sha256); const out: (number[] | null)[] = keys.map((k) => { try { return JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, `${k}.json`), 'utf8')) as number[]; } catch { return null; } });
  const miss = keys.map((k, i) => (out[i] ? -1 : i)).filter((i) => i >= 0); if (!miss.length) return out as number[][];
  if (!fs.existsSync(PYTHON()) || !fs.existsSync(SCRIPT())) throw new VisionError('model_unavailable', `The local image model is not installed (no Python environment at ${PYTHON().startsWith(root()) ? path.relative(root(), PYTHON()) : PYTHON()}; see worker/vision/README.md).`);
  const tmp = fs.mkdtempSync(path.join(/*turbopackIgnore: true*/ dir, 'in-')); const files = miss.map((i) => { const f = path.join(/*turbopackIgnore: true*/ tmp, `${keys[i]}.jpg`); fs.writeFileSync(f, images[i]); return f; });
  try {
    const res = await new Promise<{ model: string; vectors: number[][] }>((resolve, reject) => {
      const p = spawn(PYTHON(), ['-W', 'ignore', SCRIPT()], { env: { ...process.env, TORCH_HOME: process.env.TORCH_HOME || path.join(/*turbopackIgnore: true*/ root(), '.data', 'torch'), XFORMERS_DISABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let so = '', se = ''; const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new VisionError('model_failed', 'The local image model took longer than 120 seconds.')); }, Number(process.env.AVARA_VISION_TIMEOUT_MS || 120_000));
      p.stdout.on('data', (d) => { so += d; }); p.stderr.on('data', (d) => { se += d; });
      p.on('error', (e) => { clearTimeout(timer); reject(new VisionError('model_unavailable', `The local image model could not start (${e.message}).`)); });
      p.on('close', (code) => { clearTimeout(timer); if (code !== 0) return reject(new VisionError('model_failed', `The local image model failed: ${se.trim().split('\n').filter((l) => !/^\s*[\d.]+%/.test(l)).pop()?.slice(0, 200) || `exit ${code}`}.`)); try { resolve(JSON.parse(so)); } catch { reject(new VisionError('model_failed', 'The local image model returned unreadable output.')); } });
      p.stdin.end(JSON.stringify({ images: files }));
    });
    if (res.model !== MODEL_ID) throw new VisionError('model_mismatch', `The image model reported ${res.model}, expected ${MODEL_ID}.`);
    miss.forEach((i, j) => { out[i] = res.vectors[j]; fs.writeFileSync(path.join(/*turbopackIgnore: true*/ dir, `${keys[i]}.json`), JSON.stringify(res.vectors[j])); });
    return out as number[][];
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export type ReferenceSet = { version: string; model: string; viewport: { width: number; height: number }; references: ReferenceInfo[]; vectors: Record<string, number[]>; calibration: { minSimilarity: number; minShared: number; validated: boolean; note: string } | null };
export function loadReferences(): ReferenceSet | null {
  try {
    const dir = REF_DIR(); const m = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, 'manifest.json'), 'utf8'));
    const e = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, 'embeddings.json'), 'utf8')) as { model: string; vectors: Record<string, number[]> };
    let calibration = null; try { calibration = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, 'calibration.json'), 'utf8')).threshold; } catch { /* not calibrated: diagnostic only */ }
    return { version: m.version, model: e.model, viewport: m.viewport, references: m.references, vectors: e.vectors, calibration };
  } catch { return null; }
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** The nearest references to one first screen, each explained by the layout features both share. */
export function rank(vec: number[], layout: HeroLayout, set: ReferenceSet, k = 3, exclude?: string): Candidate[] {
  return set.references.filter((r) => r.id !== exclude && set.vectors[r.sha256]).map((r) => ({ r, s: dot(vec, set.vectors[r.sha256]) })).sort((a, b) => b.s - a.s).slice(0, k)
    .map(({ r, s }) => { const c = compareLayouts(layout, r.layout); return { id: r.id, name: r.name, kind: r.kind, origin: r.origin, license: r.license, similarity: Math.round(s * 1000) / 1000, shared: c.shared, differs: c.differs }; });
}
export const surfaces = (c: Candidate | undefined, t: ReferenceSet['calibration']) => !!c && !!t?.validated && c.similarity >= t.minSimilarity && c.shared.length >= t.minShared;

export async function matchHero(shot: Buffer | undefined, layout: HeroLayout | undefined, viewport?: { width: number; height: number }): Promise<HeroMatch> {
  if (process.env.AVARA_HERO_MATCH === 'off') return { status: 'skipped', skip: 'disabled', reason: 'The hero comparison is switched off (AVARA_HERO_MATCH=off).' };
  if (!shot?.length) return { status: 'skipped', skip: 'no_capture', reason: 'No first-screen screenshot was captured on desktop, so there is nothing to compare.' };
  if (!layout) return { status: 'skipped', skip: 'no_layout', reason: 'The first-screen layout was not measured, so a match could not be explained.' };
  const set = loadReferences();
  if (!set || !set.references.length) return { status: 'skipped', skip: 'no_references', reason: 'The reference set (data/hero-references) is missing or empty.' };
  if (set.model !== MODEL_ID) return { status: 'skipped', skip: 'model_mismatch', reason: `The reference embeddings were made with ${set.model}, not ${MODEL_ID}; rebuild them with scripts/hero-references.ts.`, referenceSet: set.version };
  const vw = viewport ?? layout.viewport; if (vw.width !== set.viewport.width || vw.height !== set.viewport.height) return { status: 'skipped', skip: 'viewport_mismatch', reason: `The capture is ${vw.width}x${vw.height}; the references are ${set.viewport.width}x${set.viewport.height}.`, referenceSet: set.version };
  let vec: number[];
  try { [vec] = await embed([shot]); } catch (e) { const v = e instanceof VisionError ? e : new VisionError('model_failed', (e as Error).message); return { status: 'skipped', skip: v.skip, reason: v.message, model: MODEL_ID, referenceSet: set.version }; }
  const candidates = rank(vec, layout, set); const t = set.calibration; const surfaced = surfaces(candidates[0], t);
  const reason = !t ? 'No validated threshold yet, so the nearest match is kept as a diagnostic only.' : !t.validated ? `The threshold is not validated (${t.note}), so the nearest match is kept as a diagnostic only.`
    : surfaced ? `Similarity ${candidates[0].similarity} ≥ ${t.minSimilarity} and ${candidates[0].shared.length} shared layout features ≥ ${t.minShared}.` : `The nearest match (${candidates[0]?.name}, similarity ${candidates[0]?.similarity}, ${candidates[0]?.shared.length} shared features) is below the validated threshold (similarity ${t.minSimilarity}, ${t.minShared} features).`;
  return { status: 'ok', model: MODEL_ID, referenceSet: set.version, references: set.references.length, candidates, threshold: t, surfaced, reason };
}

/** Worker step: compare the desktop first screen and keep the result beside the page context the rule engine reads. Never throws. */
export async function attachHeroMatch(out: ScanOutput): Promise<HeroMatch | null> {
  const d = out.viewports.find((v) => v.name === 'desktop'); if (!d?.pageContext) return null;
  let r: HeroMatch; try { r = await matchHero(d.viewportShot, d.pageContext.heroLayout as HeroLayout | undefined, { width: d.width, height: d.height }); } catch (e) { r = { status: 'skipped', skip: 'model_failed', reason: `The hero comparison failed: ${(e as Error).message.slice(0, 160)}` }; }
  d.pageContext.heroMatch = r; return r;
}
