// Object storage for screenshots, raw axe JSON and exports. The local driver writes to
// .data/objects. An S3-compatible driver plugs in behind the same two functions.
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.STORAGE_DIR || path.join(process.cwd(), '.data', 'objects');
const safe = (key: string) => {
  if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw new Error('invalid storage key');
  return path.join(/*turbopackIgnore: true*/ ROOT, key);
};
export async function putObject(key: string, body: Buffer | string): Promise<string> {
  const p = safe(key); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, body); return key;
}
export async function getObject(key: string): Promise<Buffer | null> {
  try { return await fs.readFile(safe(key)); } catch { return null; }
}
/** Removes every object under a prefix such as `scans/{id}` (screenshots, raw results, diagnostics, the early blocker). Missing is fine. */
export async function deletePrefix(prefix: string): Promise<void> {
  if (!/^scans\/[0-9a-f-]{36}$/i.test(prefix)) throw new Error('invalid storage prefix');
  await fs.rm(safe(prefix), { recursive: true, force: true });
}
