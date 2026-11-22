import { chromium } from 'playwright';
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1440,height:1000}}); const p=await ctx.newPage();
import fs from 'node:fs'; const pw=fs.readFileSync('.data/test-site.txt','utf8').match(/Password: (.*)/)[1].trim();
await p.goto('http://localhost:3100/login'); await p.fill('input[type=email]','site-test@example.com'); await p.fill('input[type=password]',pw); await p.locator('input[type=password]').evaluate((e)=>e.form.requestSubmit()); await p.waitForURL('**/app**'); await p.goto('http://localhost:3100/app/site-test'); const proj=await p.locator('a[href*="/projects/"]').first().getAttribute('href'); await p.goto('http://localhost:3100'+proj+'/scanner'); console.log(await p.locator('input').count()); await p.fill('#hero-url','http://127.0.0.1:4200/cta-cut.html'); await p.getByRole('button',{name:/Scan my page/}).first().click();
await p.waitForFunction(()=>document.querySelector('[data-testid=primary],[data-testid=no-issues]'),null,{timeout:120000}); await p.waitForTimeout(1500);
const d='/private/tmp/claude-501/-Users-mukultrikha--claude-spares-spare-QPFM9a/2e53ab74-f841-4133-9410-75dc91f2cb71/scratchpad/s/';
console.log(await p.getByTestId('headline').innerText().catch(()=>'none'), 'shot', await p.getByTestId('primary').getByTestId('shot').count());
await p.getByTestId('primary').screenshot({path:d+'v4.png'}); await b.close();
