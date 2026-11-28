// Journey discovery: the pure rules (links, de-duplication, purpose, selectors, success suggestions), then the real browser discovery against the fixture site.
// Run: node --experimental-strip-types --import ./test/support/use-chrome.mjs test/journeys.mjs
const PORT = 4351; process.env.ALLOW_PRIVATE_HOSTS = `127.0.0.1:${PORT}`;
const J = await import('../packages/flow-engine/journeys.ts'); const { discover } = await import('../packages/flow-engine/discover.ts'); const { createJourneySite } = await import('../fixture/apps/journey-site.mjs');
let pass = 0, fail = 0; const ok = (c, m, x = '') => { if (c) pass++; else { fail++; console.log('FAIL', m, x); } };
const O = 'http://a.test'; const L = (o = {}) => ({ text: 'Go', href: `${O}/x`, attrHref: '/x', id: '', testId: '', aria: '', targetBlank: false, visible: true, idCount: 0, hrefCount: 1, ...o });

// ---- rules ----
ok(J.normKey('http://a.test/book/') === J.normKey('http://a.test/book?ref=1#top') && J.normKey('http://a.test/Book') === J.normKey('http://a.test/book'), 'trailing slash, query, fragment and case do not make a different page');
ok(J.normKey('http://a.test/orders/123') === J.normKey('http://a.test/orders/987') && J.normKey('http://a.test/u/3f2b8c1a-1111-2222-3333-444455556666') === 'http://a.test/u/:id', 'numeric and uuid path segments collapse');
ok(J.normKey('http://a.test/a') !== J.normKey('http://a.test/b') && J.normKey('http://a.test/a') !== J.normKey('http://b.test/a'), 'different pages and origins stay different');
const why = (o) => J.skipReason(L(o), O);
ok(why({}) === null, 'an ordinary same-site link may be followed');
ok(why({ href: 'https://other.test/x' }) === 'leaves the site' && why({ href: 'mailto:a@b.test' }) === 'not a web page (mail, phone or script)' && why({ href: 'tel:+1' }) === 'not a web page (mail, phone or script)' && why({ href: 'javascript:void(0)' })?.startsWith('not a web'), 'other sites, mail, phone and script links are skipped');
ok(why({ text: 'Delete account', href: `${O}/settings` }) && why({ text: 'Log out' }) && why({ text: 'Buy now' }) && why({ text: 'Subscribe' }), 'links that look like an action that changes something are skipped, by their words');
ok(why({ href: `${O}/logout` }) && why({ href: `${O}/cart/add?id=1` }) && why({ href: `${O}/checkout` }), 'and by their address');
ok(why({ visible: false }) === 'hidden link' && why({ targetBlank: true }) === 'opens a new tab' && why({ href: `${O}/a.pdf` }) === 'a file, not a page' && why({ attrHref: '#top', href: `${O}/#top` }) === 'same-page anchor', 'hidden, new-tab, file and anchor links are skipped');
ok(J.selectorFor(L({ id: 'book', idCount: 1 })) === '#book' && J.selectorFor(L({ id: 'dup', idCount: 2, attrHref: '/book' })) === 'a[href="/book"]' && J.selectorFor(L({ testId: 'cta' })) === 'a[data-testid="cta"]' && J.selectorFor(L({ aria: 'Pricing page' })) === 'a[aria-label="Pricing page"]' && J.selectorFor(L({ attrHref: '/a"b' })) === 'a[href="/a\\"b"]', 'selector preference: id, test id, aria-label, exact href; quotes escaped');
const P = (linkText, path, title = '', h1 = '') => J.purposeOf({ linkText, path, title, h1 });
ok(P('Book a call', '/book') === 'booking' && P('Schedule a demo', '/schedule') === 'booking' && P('Get started', '/start') === 'signup' && P('Plans', '/pricing') === 'pricing' && P('Contact us', '/contact') === 'contact' && P('Log in', '/login') === 'login' && P('Our story', '/about', 'About', 'About us') === 'other', 'purpose from the link words and address');
ok(P('Next', '/x', 'Pick a time to book', 'Book your appointment') === 'booking', 'purpose falls back to the page title and heading');
{ const s = J.suggestSuccess({ url: 'http://a.test/book/calendar', title: 't', h1: 'Pick a time', keyElement: { selector: '#booking-calendar', label: 'booking-calendar' } });
  ok(s.length === 3 && s[0].type === 'url_contains' && s[0].value === '/book/calendar' && s[1].type === 'text_contains' && s[2].type === 'visible', 'success suggestion: address, heading, key element');
  ok(J.describeAssertion(s[2]) === 'The booking calendar appears' && J.describeAssertion(s[1]) === 'The page says “Pick a time”' && J.describeAssertion(s[0]) === 'The address contains “/book/calendar”', 'success conditions read in plain words'); }
ok(J.suggestSuccess({ url: 'http://a.test/', title: '', h1: '', keyElement: null }).length === 0, 'nothing is invented for a page with nothing to observe');
{ const snap = (path, h1) => ({ url: `${O}${path}`, title: h1, h1, keyElement: null }); const st = (sel, label) => ({ id: sel, action: 'click', selector: sel, label, expect: [] });
  const pages = [{ snapshot: snap('/book', 'Book a call'), linkText: 'Book a call', steps: [st('a1', 'Book a call')], depth: 1 }, { snapshot: snap('/book/calendar', 'Pick a time'), linkText: 'Choose a time', steps: [st('a1', 'Book a call'), st('a2', 'Choose a time')], depth: 2 },
    { snapshot: snap('/book/', 'Book a call'), linkText: 'Book a call', steps: [st('a9', 'Book a call'), st('a9b', 'x'), st('a9c', 'y')], depth: 2 }, { snapshot: snap('/pricing', 'Pricing'), linkText: 'Pricing', steps: [st('p1', 'Pricing')], depth: 1 }];
  const js = J.buildJourneys(pages, `${O}/`);
  ok(js.length === 2 && js[0].purpose === 'booking' && js[0].steps.length === 2 && js[1].purpose === 'pricing', 'equivalent pages merge (shortest path kept); a journey that is only the first part of a longer one of the same purpose is dropped; useful purposes come first', JSON.stringify(js.map((j) => [j.purpose, j.steps.length])));
  ok(js[0].observed[0] === 'Open the home page' && js[0].observed[1] === 'Click ‘Book a call’' && js[0].observed.at(-1).startsWith('Land on /book/calendar'), 'observed steps are in plain words', JSON.stringify(js[0].observed));
  ok(js[0].steps[0].expect.length === 0 && js[0].steps[1].expect.length > 0 && js[0].id === J.buildJourneys(pages, `${O}/`)[0].id, 'only the last step carries the suggested success; the journey id is stable'); }

// ---- the browser, on the fixture site ----
const site = createJourneySite({ mode: 'ok' }); await new Promise((r) => site.listen(PORT, '127.0.0.1', r)); const start = `http://127.0.0.1:${PORT}/`;
const d = await discover(start);
const booking = d.journeys.find((j) => j.purpose === 'booking');
ok(!!booking && booking.steps.length === 2 && /Book a call/.test(booking.observed[1]) && /Choose a time/.test(booking.observed[2]), 'from the home page alone, the two-click booking journey is found', JSON.stringify(d.journeys.map((j) => [j.purpose, j.observed])));
ok(booking?.finalUrl.endsWith('/book/calendar') && booking.steps[1].expect.some((e) => e.type === 'visible' && e.selector === '#booking-calendar') && booking.steps[1].expect.some((e) => e.type === 'text_contains' && e.text === 'Pick a time'), 'its suggested success is the calendar page: address, heading and the calendar', JSON.stringify(booking?.steps[1].expect));
ok(d.journeys.filter((j) => j.purpose === 'booking').length === 1, 'the footer links to the same booking page (with a slash, and with a query) do not make more journeys');
ok(d.journeys.some((j) => j.purpose === 'pricing') && d.journeys.some((j) => /About/.test(j.title)), 'other pages one click away are found too');
ok(!site.hits.includes('/delete') && !site.hits.includes('/logout') && !site.hits.includes('/brochure.pdf'), 'the delete and log-out links and the file link were never requested', site.hits.join(','));
ok(d.skipped.some((x) => x.reason === 'leaves the site') && d.skipped.some((x) => /mail|phone/.test(x.reason)) && d.skipped.some((x) => /changes something|state-changing/.test(x.reason)), 'what was skipped, and why, is reported');
ok(d.pagesVisited <= 8 && d.ms < 45000, 'within the page and time limits', `${d.pagesVisited} pages ${d.ms}ms`);
{ const r = await Promise.all(booking.steps.map(() => 1)); void r; }
const { Journey } = await import('../packages/contracts/index.ts'); ok(d.journeys.every((j) => Journey.safeParse(j).success), 'every journey is valid as a saved flow step list');
{ const { parseFlow } = await import('../packages/contracts/index.ts'); const f = parseFlow({ id: 'x', name: 'Booking', startUrl: start, steps: booking.steps }); ok(f.ok, 'the discovered steps parse as a flow', f.error); }
// a cap: a site with many pages stops at the page limit and says so
{ const big = (await import('node:http')).createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); const n = Number(/page-(\d+)/.exec(new URL(q.url, 'http://x').pathname)?.[1]) || 0; s.end(`<h1>Page ${n}</h1>${Array.from({ length: 12 }, (_, i) => `<a href="/page-${n * 12 + i + 1}">Item ${n * 12 + i + 1}</a>`).join(' ')}`); });
  await new Promise((r) => big.listen(PORT + 1, '127.0.0.1', r)); process.env.ALLOW_PRIVATE_HOSTS += `,127.0.0.1:${PORT + 1}`;
  const dd = await discover(`http://127.0.0.1:${PORT + 1}/`, { maxMs: 40000 }); ok(dd.pagesVisited <= 9 && dd.limits.includes('page limit') && dd.journeys.length <= 12, 'a site with endless pages (numbered ones count as the same kind of page, so these are named) stops at the page limit and says so', JSON.stringify([dd.pagesVisited, dd.limits])); big.close(); }
// a start address on a private network is refused before any browser starts
{ let msg = ''; try { await discover('http://169.254.169.254/'); } catch (e) { msg = e.message; } ok(/private|internal|port/i.test(msg), 'a private start address is refused', msg); }
site.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
