// Policy engine (milestone 3): destructive and state-changing steps are refused before anything happens, and a flow cannot widen its own
// permissions. Offline classification first, then real runs on fixture/site/flows/risky.html.
// Run: ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 node --experimental-strip-types test/policy-engine.mjs   (needs: node fixture/server.mjs)
process.env.ALLOW_PRIVATE_HOSTS ||= '127.0.0.1:4200';
const { classifyClick, classifyFill } = await import('../packages/policy-engine/index.ts'); const { parseFlow } = await import('../packages/contracts/index.ts'); const { runFlow } = await import('../packages/flow-engine/index.ts');
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const o = { startUrl: 'https://site.test/' }; const T = (p) => ({ tag: 'button', type: '', text: '', href: '', inForm: false, formMethod: '', autocomplete: '', fieldName: '', ...p });

// ---- classification (offline) ----
check('a button inside a form with no type submits, so it is refused', !classifyClick(T({ inForm: true, text: 'Save' }), o).allow && classifyClick(T({ inForm: true, text: 'Save' }), o).rule === 'submit');
check('type=button outside a form is allowed', classifyClick(T({ type: 'button', text: 'Show more' }), o).allow);
check('purchase, delete, send and cancel wording is refused (case-insensitive)', ['Buy now', 'DELETE account', 'Send message', 'Place order', 'Cancel my subscription', 'Log out', 'Pay $20'].every((t) => classifyClick(T({ type: 'button', text: t }), o).rule === 'destructive_text'));
check('ordinary wording is allowed, including words that only contain a blocked word', ['Show more', 'Continue', 'Open menu', 'Compare plans', 'Postal code help'].every((t) => classifyClick(T({ type: 'button', text: t }), o).allow));
check('a link to a state-changing path is refused even when its label is harmless', classifyClick(T({ tag: 'a', text: 'Account', href: 'https://site.test/logout' }), o).rule === 'destructive_link');
check('a link to another origin is refused; the same origin is allowed', classifyClick(T({ tag: 'a', text: 'Partner', href: 'https://other.test/' }), o).rule === 'cross_origin' && classifyClick(T({ tag: 'a', text: 'Pricing', href: 'https://site.test/pricing' }), o).allow);
check('password, card, autocomplete cc- and identity fields are refused', [{ type: 'password' }, { autocomplete: 'cc-number' }, { fieldName: 'card_number' }, { fieldName: 'ssn' }, { autocomplete: 'one-time-code' }].every((p) => classifyFill(T({ tag: 'input', ...p }), o).rule === 'sensitive_field') && classifyFill(T({ tag: 'input', fieldName: 'nickname' }), o).allow);
check('hosts can loosen one rule at a time', classifyClick(T({ inForm: true, text: 'Save' }), { ...o, allowSubmit: true }).allow && !classifyClick(T({ type: 'button', text: 'Delete' }), { ...o, allowSubmit: true }).allow);

// ---- real runs ----
const F = 'http://127.0.0.1:4200/flows/risky.html'; const mk = (id, steps) => { const r = parseFlow({ id, name: id, startUrl: F, steps }); if (!r.ok) throw new Error(r.error); return r.flow; };
const one = async (id, steps, opts) => { const r = await runFlow(mk(id, steps), opts); return { r, s: r.steps.find((x) => x.stepId === steps.at(-1).id) }; };
const refused = (x, rule) => x.r.status === 'blocked' && x.s.status === 'blocked' && x.s.error.includes(`(${rule})`) && /risky\.html$/.test(x.s.urlAfter);

const sub = await one('sub', [{ id: 'save', action: 'click', selector: '#save' }]);
check('a form submit is refused and the browser never leaves the page', refused(sub, 'submit'), sub.s.error);
const del = await one('del', [{ id: 'del', action: 'click', selector: '#delete' }]);
check('“Delete account” is refused', refused(del, 'destructive text'), del.s.error);
const buy = await one('buy', [{ id: 'buy', action: 'click', selector: '#buy' }]);
check('a “Buy now” link is refused before it navigates', refused(buy, 'destructive text'));
const out = await one('out', [{ id: 'out', action: 'click', selector: '#out' }]);
check('a link to another site is refused', refused(out, 'cross origin'), out.s.error);
const lo = await one('lo', [{ id: 'lo', action: 'click', selector: '#logout' }]);
check('a /logout link labelled “Account” is refused by its address', refused(lo, 'destructive link'), lo.s.error);
const card = await one('card', [{ id: 'card', action: 'fill', selector: '#card', value: '4242424242424242' }]);
check('a card field is refused, and the number is not in the run record', refused(card, 'sensitive field') && !JSON.stringify(card.r).includes('4242'));
const enter = await one('enter', [{ id: 'f', action: 'click', selector: '#note', expect: [] }, { id: 'e', action: 'press', key: 'Enter' }]);
check('Enter inside a form field is refused (it would submit)', enter.r.status === 'blocked' && enter.s.error.includes('(enter in form)'), enter.s.error);
const gone = await one('gone', [{ id: 'g', action: 'goto', url: 'https://example.com/' }]);
check('a goto to another site is refused', gone.r.status === 'blocked' && gone.s.error.includes('(cross origin)'), gone.s.error);

const safe = await runFlow(mk('safe', [{ id: 'more', action: 'click', selector: '#plain', expect: [{ type: 'visible', selector: '#ok' }] }, { id: 'nick', action: 'fill', selector: '#nick', value: 'Ada' }]));
check('harmless steps on the same page still pass', safe.status === 'passed', safe.steps.map((s) => `${s.stepId}:${s.status}`).join(' '));

// ---- the flow cannot widen its own permissions ----
const sneaky = parseFlow({ id: 'x', name: 'x', startUrl: F, allowSubmit: true, policy: { allowSubmit: true }, steps: [{ id: 'save', action: 'click', selector: '#save', allowSubmit: true, allowDestructive: true }] });
const sr = await runFlow(sneaky.flow);
check('allow flags written into the flow JSON are dropped and change nothing', sneaky.ok && !('allowSubmit' in sneaky.flow) && !('allowSubmit' in sneaky.flow.steps[0]) && sr.status === 'blocked');
check('a step named “start” cannot be used to skip the policy', !parseFlow({ id: 'x', name: 'x', startUrl: F, steps: [{ id: 'start', action: 'goto', url: 'https://example.com/' }] }).ok);
const extra = await runFlow(mk('extra', [{ id: 'save', action: 'click', selector: '#save' }]), { beforeStep: () => ({ allow: true }) });
check('an extra beforeStep that says “allow” cannot override the policy', extra.status === 'blocked');
const loose = await runFlow(mk('loose', [{ id: 'save', action: 'click', selector: '#save', expect: [{ type: 'url_contains', value: 'submitted.html' }] }]), { policy: { allowSubmit: true } });
check('the host can allow submits for one run, and then the submit goes through', loose.status === 'passed', loose.steps.at(-1).urlAfter);
const pwLoose = await runFlow(mk('pwl', [{ id: 'n', action: 'click', selector: '#plain' }]), { policy: { allowSensitiveFields: true, allowSubmit: true, allowDestructive: true, allowCrossOrigin: true } });
check('a fully loosened policy still runs ordinary steps', pwLoose.status === 'passed');

const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
