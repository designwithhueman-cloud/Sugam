// Exposure checks against known outcomes: the leaky fixture must be flagged on every check, the clean single-page fixture on none.
// Run: node --experimental-strip-types test/security-exposure.mjs
const PL = 4321, PC = 4322; process.env.ALLOW_PRIVATE_HOSTS = `127.0.0.1:${PL},127.0.0.1:${PC}`;
const { createLeakyApp, SERVICE, STRIPE, ANON, OPEN_ROW } = await import('../fixture/apps/leaky-app.mjs');
const { auditSite, scanCode, compareExposure, verdict } = await import('../packages/security-exposure/index.ts');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const listen = (s, port) => new Promise((r) => s.listen(port, '127.0.0.1', r));
const leaky = createLeakyApp({ leaky: true }), clean = createLeakyApp({ leaky: false }); await listen(leaky, PL); await listen(clean, PC);
const opts = (port, active) => ({ active, supabaseBaseFor: () => `http://127.0.0.1:${port}` });
const by = (r, id) => r.find((x) => x.id === id);

// unit: code scanning
{ const k = scanCode(`x="${SERVICE}"; y="${ANON}"; z="${STRIPE}"; q="sk-ant-api03-${'a'.repeat(40)}"`);
  ok(k.secrets.some((s) => /service key/.test(s.kind)), 'service key recognised'); ok(k.secrets.some((s) => /Stripe/.test(s.kind)), 'stripe key recognised'); ok(k.secrets.some((s) => /Anthropic/.test(s.kind)), 'anthropic key recognised');
  ok(k.anon.length === 1 && k.anon[0].ref === 'fixtureproj', 'public anon key is not treated as a secret but is found');
  ok(!JSON.stringify(k).includes(STRIPE) && !JSON.stringify(k).includes(SERVICE), 'no whole secret is ever returned');
  ok(scanCode('const a = "task-list-with-dashes-and-long-text-0123456789012345678901234567890123456789"').secrets.length === 0, 'ordinary long strings are not flagged'); }

// leaky app, passive only
{ const r = await auditSite(`http://127.0.0.1:${PL}/`, opts(PL, false));
  ok(by(r, 'SEC-011').status === 'flag' && by(r, 'SEC-011').severity === 'critical', 'leaky: secrets flagged critical');
  ok(by(r, 'SEC-011').evidence.length === 2, `leaky: two secrets listed (got ${by(r, 'SEC-011').evidence.length})`);
  ok(['SEC-012', 'SEC-013', 'SEC-014'].every((id) => by(r, id).status === 'unverified'), 'passive run does not probe: active checks are unverified');
  ok(!JSON.stringify(r).includes(STRIPE) && !JSON.stringify(r).includes(SERVICE), 'passive result holds no whole secret'); }
// leaky app, active
{ const r = await auditSite(`http://127.0.0.1:${PL}/`, opts(PL, true));
  ok(by(r, 'SEC-012').status === 'flag' && by(r, 'SEC-012').evidence.some((e) => e.startsWith('/.env')) && by(r, 'SEC-012').evidence.some((e) => e.startsWith('/.git/config')), 'leaky: .env and .git found');
  ok(by(r, 'SEC-013').status === 'flag', 'leaky: source map found');
  ok(by(r, 'SEC-014').status === 'flag' && by(r, 'SEC-014').evidence.some((e) => e.startsWith('customers')), 'leaky: open table flagged');
  ok(!by(r, 'SEC-014').evidence.some((e) => e.startsWith('private_notes')), 'leaky: the protected table is not flagged');
  ok(!JSON.stringify(r).includes(OPEN_ROW.email) && !JSON.stringify(r).includes('FIXTURE_ROW_VALUE'), 'row values are never kept');
  ok(r.every((x) => x.status !== 'flag' || x.fix.length > 40), 'every flag has a plain fix message'); }
// clean single-page app that answers 200 to everything
{ const r = await auditSite(`http://127.0.0.1:${PC}/`, opts(PC, true));
  ok(r.every((x) => x.status === 'pass'), `clean: nothing flagged (got ${r.map((x) => x.id + ':' + x.status).join(',')})`); }
// unreachable
{ const r = await auditSite('http://127.0.0.1:1/', { active: true }); ok(r.every((x) => x.status === 'unverified'), 'unreachable site: everything unverified, nothing crashes'); }

// before/after and verdict
{ const R = (id, status, severity = null, active = false) => ({ id, title: id, status, severity, active, plain: '', fix: 'x'.repeat(50), evidence: [] });
  const before = [R('SEC-011', 'flag', 'critical'), R('SEC-012', 'pass', null, true), R('SEC-013', 'unverified', null, true), R('SEC-014', 'flag', 'critical', true)];
  const after = [R('SEC-011', 'pass'), R('SEC-012', 'flag', 'critical', true), R('SEC-013', 'flag', 'medium', true), R('SEC-014', 'flag', 'critical', true)];
  const c = Object.fromEntries(compareExposure(before, after).map((x) => [x.id, x.outcome]));
  ok(c['SEC-011'] === 'fixed' && c['SEC-012'] === 'new' && c['SEC-013'] === 'newly_found' && c['SEC-014'] === 'still_open', `comparison outcomes (got ${JSON.stringify(c)})`);
  ok(verdict(after).level === 'stop' && verdict([R('SEC-011', 'flag', 'medium')]).level === 'fix', 'verdict: critical stops, lesser problems say fix first');
  ok(verdict([R('SEC-011', 'pass'), R('SEC-012', 'unverified', null, true)]).level === 'partial', 'verdict: unchecked active checks are never reported as fine');
  ok(verdict([R('SEC-011', 'pass'), R('SEC-012', 'pass', null, true)]).level === 'ok' && !/safe/i.test(verdict([R('SEC-011', 'pass')]).headline), 'verdict: ok says what was checked, never "safe"'); }

leaky.close(); clean.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
