// Redaction: every secret-shaped value is hidden, ordinary values are untouched, masking is idempotent, findings keep their kind and location, and
// saved flows refuse sensitive literals. Synthetic canaries only. No browser, no server.
// Run: node --experimental-strip-types test/redaction.mjs
import fs from 'node:fs';
import { makeCanaries, RAW, rnd, jwt } from './support/canaries.mjs';
const R = await import('../lib/security/redact.ts');
const { scanCode } = await import('../packages/security-exposure/index.ts');
const { stripSecrets } = await import('../lib/net/url-privacy.ts');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const C = makeCanaries(); const has = (s, v) => String(s).includes(v);

// ---- every kind is masked, to the well-known prefix and nothing after it ----
const EXPECT = { stripe: 'sk_live_••••', restricted: 'rk_live_••••', stripeTest: 'sk_test_••••', openai: 'sk-••••', openaiProject: 'sk-proj-••••', anthropic: 'sk-ant-••••', aws: 'AKIA••••', github: 'ghp_••••', slack: 'xoxb-••••', supabaseSecret: 'sb_secret_••••', google: 'AIza••••', serviceJwt: 'eyJ••••', anonJwt: 'eyJ••••', userJwt: 'eyJ••••' };
for (const [k, want] of Object.entries(EXPECT)) { const out = R.redactText(`value: ${C[k]} end`); ok(out === `value: ${want} end`, `${k} is masked to its prefix only (got “${out}”)`); }
{ const out = R.redactText(`before\n${C.privateKey}\nafter`); ok(out === 'before\n[private key removed]\nafter' && !out.includes(C.privateKey.split('\n')[1]), 'a private key block is removed whole, header and body'); }
ok(R.redactText(`a ${C.stripe} b ${C.stripe} c`) === 'a sk_live_•••• b sk_live_•••• c', 'every occurrence is masked, not only the first');
// Supabase: all JWTs hidden, including the public (anon) one. A JWT is also hidden when it is not Supabase's.
ok(!has(R.redactText(C.anonJwt), 'eyJh') || R.redactText(C.anonJwt) === 'eyJ••••', 'the anon JWT is hidden in stored evidence');

// ---- idempotent ----
{ const corpus = Object.values(C).concat([`${C.stripe}&x=1?token=${C.param}`, 'plain text', `https://a.example/p?api_key=${C.github}&q=shoes`]);
  ok(corpus.every((t) => { const once = R.redactText(t); return R.redactText(once) === once; }), 'masking masked text changes nothing (every canary and mixed strings)');
  const obj = { a: [C.stripe, { b: C.serviceJwt }], n: 3, z: null }; const once = R.redactDeep(obj); ok(JSON.stringify(R.redactDeep(once)) === JSON.stringify(once), 'redactDeep is idempotent on nested data'); }

// ---- ordinary values are untouched (no entropy rule) ----
const uuid = '3f2b9c1e-8a47-4c1d-9e0f-1b2a3c4d5e6f', sha = rnd(64, '0123456789abcdef'), b64img = 'data:image/jpeg;base64,' + rnd(6000);
const ordinary = [uuid, sha, b64img, 'pk_live_' + rnd(24), 'sb_publishable_' + rnd(24), 'task-list-with-dashes-and-a-very-long-name-that-is-not-a-key-0123456789', 'https://example.com/products/shoes?color=red&page=2', 'Welcome to the future of work', 'AKIA1234', 'sk-learn', 'eyJ-not-a-token', 'class="btn btn-primary text-lg font-semibold tracking-tight"', rnd(64)];
ok(ordinary.every((t) => R.redactText(t) === t), 'UUIDs, hashes, image data, publishable keys, ordinary long strings and URLs are untouched');
{ const data = { s: 'text', n: 7, b: true, nul: null, u: undefined, d: new Date(0), buf: Buffer.from('abc') }; const out = R.redactDeep(data); ok(out === data, 'nothing to hide: the same object comes back'); const withSecret = R.redactDeep({ ...data, k: C.stripe }); ok(withSecret.buf === data.buf && withSecret.d === data.d && withSecret.n === 7 && withSecret.nul === null && withSecret.k === 'sk_live_••••', 'numbers, dates and image buffers pass through; the secret string is masked'); }
{ const a = { x: C.stripe }; a.self = a; let threw = false; try { R.redactDeep(a); } catch { threw = true; } ok(!threw, 'a cyclic object does not crash masking'); }

// ---- addresses ----
ok(R.redactText(`/go?api_key=${C.github}&q=shoes`) === '/go?api_key=[removed]&q=shoes', 'a secret-named address parameter is masked in any text, other parameters stay');
ok(R.redactText(`<a href="/x?a=1&amp;token=${C.param}&amp;b=2">`) === '<a href="/x?a=1&amp;token=[removed]&amp;b=2">', 'the same inside HTML, with &amp;');
ok(!stripSecrets(`https://x.example/reset/${C.stripe}/go?x=${C.stripe}&page=2&token=${C.param}#frag`).toString().includes(C.stripe), 'a submitted address loses a key in its path and in a parameter with an ordinary name');
ok(stripSecrets(`https://x.example/reset/${C.stripe}/go?x=${C.stripe}&page=2&token=${C.param}#frag`).toString() === 'https://x.example/reset/[removed]/go?page=2#frag', 'only the secret parts are removed: the rest of the address survives');
ok(R.redactUrl(`https://x.example/a/${C.github}?q=1`) === 'https://x.example/a/[removed]?q=1', 'redactUrl cleans a stored address');

// ---- classification keeps the kind and the location, then the value is gone ----
{ const k = scanCode(`const a="${C.stripe}"; const s="${C.serviceJwt}"; const p="${C.anonJwt}"; const g="${C.google}"; const sb="${C.supabaseSecret}"; const pk="pk_live_${rnd(24)}"`, '/assets/app.js');
  const kinds = k.secrets.map((s) => s.kind);
  ok(kinds.includes('Stripe live secret key') && kinds.includes('Supabase service key (full database access)') && kinds.includes('Supabase secret key'), 'the Launch check classifies Stripe, Supabase service and Supabase secret keys as leaks');
  ok(k.secrets.length === 3 && k.anon.length === 1, 'the anon JWT is not a leak (it is kept only to test tables), AIza and pk_live are not leaks');
  ok(k.secrets.every((s) => s.location === '/assets/app.js'), 'every finding keeps where it was found');
  ok(!JSON.stringify(k).includes(C.stripe) && !JSON.stringify(k).includes(C.serviceJwt) && !JSON.stringify(k).includes(C.supabaseSecret) && k.secrets.every((s) => /••••$|removed\]$/.test(s.preview)), 'the findings carry only a masked form'); }
{ const { value, hidden } = R.redactDeepReport({ viewports: [{ axe: { nodes: [{ html: `<p>${C.stripe}</p>`, selector: '#p1' }, { html: `<p>${C.stripe} ${C.github}</p>`, selector: '#p2' }] } }] });
  ok(value.viewports[0].axe.nodes[0].selector === '#p1' && value.viewports[0].axe.nodes[1].selector === '#p2', 'the finding’s location (its selector) is preserved while its evidence is masked');
  const s = hidden.find((h) => h.kind === 'Stripe live secret key'); ok(s && s.count === 2 && s.where === 'viewports[].axe.nodes[].html' && !JSON.stringify(hidden).includes(C.stripe), 'the report says what was hidden and where (kind, field, count), never the value'); }

// ---- the scan output ----
{ const out = { url: `https://x.example/a/${C.github}?token=${C.param}&q=1`, finalUrl: `https://x.example/b?x=${C.stripe}`, limitations: ['existing note'], viewports: [{ buf: Buffer.from('img'), text: `Key ${C.stripe}` }] };
  const r = R.redactScanOutput(out);
  ok(!JSON.stringify(r).includes(C.github) && !JSON.stringify(r).includes(C.stripe) && !JSON.stringify(r).includes(C.param), 'the scan output holds no raw value, in text or in addresses');
  ok(r.limitations.length === 2 && /^\d+ values that look like secrets \(.*\) were hidden in the stored evidence\. Findings and their locations are unchanged\.$/.test(r.limitations[1]) && !r.limitations[1].includes('sk_') && r.limitations[0] === 'existing note', 'a one-line note says how many were hidden, without saying what');
  ok(r.viewports[0].buf === out.viewports[0].buf, 'screenshots (Buffers) are never touched by text masking'); }

// ---- logs and errors ----
{ const seen = []; const real = console.error; console.error = (...a) => seen.push(a.join(' ')); R.logError('scan failed', new Error(`boom ${C.stripe} ${C.serviceJwt}`)); console.error = real;
  ok(seen.length === 1 && !has(seen[0], C.stripe) && !has(seen[0], C.serviceJwt) && has(seen[0], 'sk_live_••••'), 'logError masks the message');
  ok(!has(R.redactError(new Error(`bad ${C.github}`)), C.github) && R.redactError(new Error('plain failure')) === 'plain failure', 'redactError masks, and leaves ordinary messages alone'); }
{ const run = { flowId: 'f', status: 'failed', consoleErrors: [`x ${C.openai}`], failedRequests: [{ url: `https://a.example/api?access_token=${C.param}&k=${C.stripe}`, status: 500, reason: 'HTTP error' }], steps: [{ stepId: 's', error: `saw ${C.github}`, urlAfter: `https://a.example/?q=${C.stripe}` }] };
  const out = R.redactDeep(run); ok(!JSON.stringify(out).includes(C.openai) && !JSON.stringify(out).includes(C.param) && !JSON.stringify(out).includes(C.github) && !JSON.stringify(out).includes(C.stripe) && out.failedRequests[0].status === 500 && out.steps[0].stepId === 's', 'a stored flow run is masked and keeps its structure'); }

// ---- saved flows refuse sensitive literals, ordinary inputs stay replayable ----
const flow = (steps) => ({ steps });
const bad = (v, sel = '#field') => R.sensitiveFillProblem(flow([{ id: 'f1', action: 'fill', selector: sel, value: v }]));
ok(bad(C.stripe) && bad(C.openai) && bad(C.github) && bad(C.serviceJwt) && bad(C.supabaseSecret) && bad(C.google) && bad(C.privateKey), 'fill values that look like keys, tokens or private keys are refused');
ok(bad('4242 4242 4242 4242') && bad('4111111111111111') && bad('123-45-6789'), 'a card number (valid check digit) and a national ID number are refused');
ok(bad('hunter2', 'input[type=password]') && bad('x', '#cvv') && bad('x', '[name=api_key]') && bad('x', '#card-number'), 'a value typed into a password, card or secret field is refused, whatever the value');
ok(!bad('AVARA_TEST_Customer', '#name') && !bad('alice@avara-test.local', '#email') && !bad('running shoes', 'input[type=search]') && !bad('1234567890123456', '#order') && !bad('12345', '#zip') && !bad('Hello, world', '#message'), 'ordinary inputs (names, emails, search text, order numbers, ZIP codes) are accepted');
ok(R.sensitiveFillProblem(flow([{ id: 'c1', action: 'click', selector: '#password' }, { id: 'w', action: 'wait_for', selector: '#token' }])) === null, 'only fill steps are checked: clicking or waiting on a password field is fine');
ok(/Step “f1” fills a value that looks like a secret key\. Saved flows cannot store credentials/.test(bad(C.stripe).reason) && bad(C.stripe).stepId === 'f1', 'the refusal says which step and why, in plain words');

// ---- speed, and a guard for future error monitoring ----
{ const big = { viewports: Array.from({ length: 160 }, (_, i) => ({ html: Array.from({ length: 200 }, (_, j) => `<div class="c${j}" data-i="${i}">${rnd(40)} ${j % 50 === 0 ? C.stripe : ''}</div>`).join('') })) };
  const size = JSON.stringify(big).length; const t0 = Date.now(); const out = R.redactDeep(big); const ms = Date.now() - t0;
  ok(size > 1_500_000 && ms < 2000 && !JSON.stringify(out).includes(C.stripe), `a ${(size / 1e6).toFixed(1)} MB scan output is masked in ${ms} ms (limit 2000)`); }
{ const deps = Object.keys({ ...JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies, ...JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies });
  ok(!deps.some((d) => /sentry|bugsnag|rollbar|datadog|newrelic|honeybadger|airbrake/i.test(d)), 'no error-monitoring SDK is installed. If one is added, send every event through redactDeep (lib/security/redact.ts) and update this check'); }

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
