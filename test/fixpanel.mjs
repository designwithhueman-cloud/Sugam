// The free fix panel: a plain title, one sentence about who it affects, a short prompt with a visible Copy prompt button, and the
// evidence tucked into Technical details. Scans fixture/site/long-urls.html (a very long image address) and checks that nothing
// runs past the panel at desktop and 320px widths. Needs the app and `node fixture/server.mjs` running.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:3100'; const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage();
await p.goto(base + '/'); await p.fill('#hero-url', 'http://127.0.0.1:4200/long-urls.html'); await p.getByRole('button', { name: /Scan my page free/ }).first().click();
await p.waitForFunction(() => document.querySelector('[data-testid=primary]'), null, { timeout: 90000 });
const panel = p.getByTestId('primary'); await p.getByTestId('see-fix').click(); await p.waitForTimeout(200);
const info = async () => panel.evaluate((s) => { const r = s.getBoundingClientRect(), btn = [...s.querySelectorAll('button')].find((x) => /Copy prompt|Copied|Copy failed/.test(x.innerText)), bb = btn.getBoundingClientRect(), pre = s.querySelector('[data-testid=fix-text]'); const bad = [...s.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || q.left < r.left - 1); }).length; return { docW: document.documentElement.scrollWidth, vw: innerWidth, panelW: Math.round(r.width), outside: bad, btnInView: bb.top >= 0 && bb.bottom <= innerHeight + 4 || (bb.top < innerHeight && bb.bottom > 0), preChars: pre.innerText.length, text: s.innerText }; });
let i = await info();
check('desktop: nothing runs past the panel and the page does not scroll sideways', i.outside === 0 && i.docW <= i.vw, JSON.stringify({ outside: i.outside, docW: i.docW, vw: i.vw }));
check('the headline is plain language and one sentence says who may be affected', /Images without a text description/.test(i.text) && /may be unable to/.test(i.text));
check('the prompt is short (under 900 characters) and holds the element, the change and how to verify', i.preChars < 900 && /Element:/.test(i.text) && /Change:/.test(i.text) && /Verify:/.test(i.text), `${i.preChars} characters`);
check('the prompt does not carry scan evidence or repeated context', !/What Sugam measured|Fix any of the following|Ask me if you are unsure|Prefer native HTML/.test(await panel.getByTestId('fix-text').innerText()));
check('Copy prompt is one clear action next to the prompt heading', (await panel.getByRole('button', { name: /Copy prompt/ }).count()) === 1);
await panel.getByRole('button', { name: /Copy prompt/ }).click(); await p.waitForTimeout(200);
const clip = await p.evaluate(() => navigator.clipboard.readText()); check('Copy prompt copies the whole prompt', clip.startsWith('Fix:') && clip.includes('Verify:') && clip.length < 900);
const det = panel.getByTestId('technical'); check('Technical details is closed by default and holds the rule, the source and the elements', (await det.getAttribute('open')) === null && (await det.evaluate((e) => e.textContent.includes('Rule') && e.textContent.includes('Who is affected') && e.textContent.includes('Source passage'))));
await det.locator('summary').click(); await p.waitForTimeout(200); i = await info(); check('desktop: opening Technical details still keeps everything inside the panel', i.outside === 0 && i.docW <= i.vw, JSON.stringify({ outside: i.outside, docW: i.docW }));
await p.setViewportSize({ width: 320, height: 640 }); await p.waitForTimeout(300); i = await info();
check('320px: nothing runs past the panel and the page does not scroll sideways', i.outside === 0 && i.docW <= i.vw, JSON.stringify({ outside: i.outside, docW: i.docW, vw: i.vw }));
await panel.getByTestId('technical').evaluate((d) => (d.open = false)); await p.waitForTimeout(150);
const btn = panel.getByRole('button', { name: /Copy prompt/ }); await btn.scrollIntoViewIfNeeded(); check('320px: the Copy prompt button is on screen, wide, and its label stays on one line', await btn.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 150 && r.height < 64; }));
await p.screenshot({ path: '/tmp/fix-320.png' });
await b.close(); const f = results.filter((x) => !x).length; console.log(f ? `\n${f} FAILED` : '\nAll passed'); process.exit(f ? 1 : 0);
