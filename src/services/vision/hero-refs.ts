// Reads one reference screenshot from the versioned reference set. Only ids listed in the manifest are served; nothing else on disk is reachable.
import fs from 'node:fs';
import path from 'node:path';
import type { ReferenceInfo } from './hero-layout.ts';

const dir = () => process.env.AVARA_HERO_REFS || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'hero-references');
export function referenceInfo(id: string): ReferenceInfo | null {
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return null;
  try { return (JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir(), 'manifest.json'), 'utf8')).references as ReferenceInfo[]).find((r) => r.id === id) ?? null; } catch { return null; }
}
export function referenceShot(id: string): Buffer | null {
  const r = referenceInfo(id); if (!r || !/^screenshots\/[a-z0-9-]+\.jpg$/.test(r.screenshot)) return null;
  try { return fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir(), r.screenshot)); } catch { return null; }
}
