// Run one scan from the command line: node scanner/cli.ts <url> [standard] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { scanUrl } from './scanner.ts';
import type { StandardId } from '../lib/standards.ts';

const [url, std = 'wcag22aa', out = '.data/cli'] = process.argv.slice(2);
if (!url) { console.error('usage: node scanner/cli.ts <url> [standard] [outDir]'); process.exit(1); }
const t = Date.now();
const r = await scanUrl(url, std as StandardId, (s, p) => console.error(`[${p}%] ${s}`));
fs.mkdirSync(out, { recursive: true });
for (const v of r.viewports) {
  fs.writeFileSync(path.join(out, `${v.name}.jpg`), v.screenshot);
  const { screenshot, viewportShot, ...rest } = v; void screenshot; void viewportShot;
  fs.writeFileSync(path.join(out, `${v.name}.json`), JSON.stringify(rest, null, 2));
  console.log(`\n== ${v.name} ${v.width}x${v.height}  page ${v.pageWidth}x${v.pageHeight}`);
  console.log('axe violations:', v.axe.violations.map((x) => `${x.id}(${x.impact}):${x.nodes.length}`).join(' '));
  console.log('axe incomplete:', v.axe.incomplete.map((x) => `${x.id}:${x.nodes.length}`).join(' ') || '-');
  console.log('passes:', v.axe.passes.length, 'rules');
  console.log('duplicate CTAs:', v.heuristics.duplicateCtas.map((g) => `"${g.name}"x${g.nodes.length}`).join(' ') || '-');
  console.log('clickables:', v.heuristics.clickables.map((c) => (c.confirmed ? 'confirmed' : 'review')).join(' ') || '-');
  console.log('tablists:', JSON.stringify(v.heuristics.tablists.map((x) => ({ problems: x.problems.length, keyboard: x.keyboard }))));
  console.log('reflow:', v.heuristics.reflow ? `${v.heuristics.reflow.overflow}px overflow, ${v.heuristics.reflow.offenders.length} offenders` : '-');
  console.log('motion:', v.motion ? `${v.motion.running.length} running after reduce, rule present: ${v.motion.hasReducedMotionRule}` : '-');
  console.log('keyboard:', v.keyboard.map((s) => s.none ? '∅' : `${s.tag}${s.indicator ? '' : '!noring'}${s.obscured === 'full' ? '!HIDDEN' : s.obscured === 'partial' ? '!partial' : ''}`).join(' '));
  const boxes = Object.values(v.boxes); console.log('boxes:', boxes.length, 'visible', boxes.filter((b) => b && b.visible).length);
}
console.log('\nlimitations:', r.limitations, '\nengine:', r.engine, `\n${Date.now() - t} ms`);
