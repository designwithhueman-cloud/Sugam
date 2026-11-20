// Crawl every page as the test user, on desktop and a phone: console errors, failed requests, sideways overflow, axe violations.
// node test/crawl.mjs [screenshotDir]   (needs the app running and .data/test-account.txt from test/setup-test-account.mjs)
// Crawl every page as the test user: console errors, failed requests, horizontal overflow, axe violations.
import { chromium } from 'playwright'; import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const dir = process.argv[2] || ''; const c0 = fs.readFileSync('.data/test-account.txt', 'utf8'); const email = c0.match(/Email: (\S+)/)[1], pw = c0.match(/Password: (\S+)/)[1];
const b = await chromium.launch({ channel: 'chrome' });
for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: label === 'mobile', hasTouch: label === 'mobile', reducedMotion: 'reduce' }); const p = await ctx.newPage();
  const bad = []; p.on('console', (m) => { if (m.type() === 'error') bad.push('console: ' + m.text().slice(0, 120)); }); p.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 120))); p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/auth')) bad.push(r.status() + ' ' + r.url().replace('http://localhost:3100', '')); });
  await p.goto('http://localhost:3100/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.locator('#password').evaluate((e) => e.form.requestSubmit()); await p.waitForURL('**/app**');
  await p.goto('http://localhost:3100/app/test-agency'); const proj = await p.locator('a[href*="/projects/"]').first().getAttribute('href');
  await p.goto('http://localhost:3100' + proj + '/scanner'); const sid = await p.evaluate(() => document.body.innerHTML.match(/\/scans\/([0-9a-f-]{36})/)?.[1]);
  const pages = ['/app', '/app/test-agency', '/app/test-agency/settings', proj, proj + '/reports', proj + '/scanner', proj + '/compare', `/scans/${sid}`, '/', '/website-accessibility-checker', '/login', '/signup', '/upgrade?plan=agency', '/privacy', '/terms', '/tools/contrast-checker', '/tools/ai-builder-rules', '/learn', '/learn/wcag-in-plain-language', '/learn/accessibility-in-ai-built-sites', '/learn/fix-low-contrast', '/learn/keyboard-and-focus', '/learn/write-good-alt-text'];
  for (const path of pages) {
    bad.length = 0; await p.goto('http://localhost:3100' + path); await p.waitForTimeout(500);
    const over = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    await p.evaluate(axeSrc); const res = await p.evaluate(async () => { const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }); return r.violations.map((v) => v.id + 'x' + v.nodes.length); });
    console.log(label.padEnd(8), path.slice(0, 54).padEnd(54), over.sw > over.cw + 1 ? `OVERFLOW ${over.sw}>${over.cw}` : 'fits', bad.length ? '| ' + [...new Set(bad)].slice(0, 3).join(' ; ') : '', res.length ? '| axe: ' + res.join(',') : '');
    if (dir && label === 'desktop' && /reports|^\/app\/test-agency$|settings|scanner|compare/.test(path)) await p.screenshot({ path: `${dir}/c-${path.replace(/[^a-z]+/gi, '_').slice(-30)}.png` });
  }
  await ctx.close();
}
await b.close();
