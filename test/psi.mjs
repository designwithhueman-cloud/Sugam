// PageSpeed Insights (real-visitor data) tests. No network: fetch is replaced with canned PSI v5 responses.
// Run: node --experimental-strip-types test/psi.mjs
const { parseField, fetchPsi } = await import('../scanner/psi.ts');
const { runLighthouse } = await import('../scanner/perf.ts');
const { derivedReports } = await import('../src/services/scan-service/derived.ts');

const results = []; const check = (name, ok) => { results.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`); };
const crux = (o = {}) => ({ id: 'https://shop.example.com/', initial_url: 'https://shop.example.com/', overall_category: 'AVERAGE', metrics: {
  LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2900, category: 'AVERAGE' }, INTERACTION_TO_NEXT_PAINT: { percentile: 340, category: 'AVERAGE' }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: 'FAST' },
}, ...o });
const lhr = { lighthouseVersion: '13.0.1', fetchTime: '2026-11-21T10:00:00.000Z', configSettings: { throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 } },
  audits: { 'largest-contentful-paint': { numericValue: 3100, score: 0.7 }, 'cumulative-layout-shift': { numericValue: 0.02, score: 1 }, 'total-blocking-time': { numericValue: 120 } } };
const realFetch = globalThis.fetch;
const respond = (status, body) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); };

// ---- parsing ----
let f = parseField({ loadingExperience: crux({ collectionPeriod: { firstDate: { year: 2026, month: 10, day: 20 }, lastDate: { year: 2026, month: 11, day: 16 } } }), originLoadingExperience: crux({ id: 'https://shop.example.com' }) });
check('URL-level CrUX data is reported as this page, with its 75th percentiles and Google category', f.available && f.scope === 'url' && f.metrics.lcp.p75 === 2900 && f.metrics.inp.p75 === 340 && f.metrics.inp.category === 'needs improvement' && f.metrics.cls.category === 'good');
check('CLS percentile is divided by 100 (PSI reports 5 for 0.05)', f.available && f.metrics.cls.p75 === 0.05);
check('the collection period is named when Google gives it', f.available && f.periodNote === '2026-10-20 to 2026-11-16' && /2026-10-20 to 2026-11-16/.test(f.note));
check('the note says these are real visitors and separate from the lab numbers', f.available && /Real visitors/.test(f.note) && /separate from Avara's lab numbers/.test(f.note));
f = parseField({ loadingExperience: crux({ origin_fallback: true, id: 'https://shop.example.com' }), originLoadingExperience: crux({ id: 'https://shop.example.com' }) });
check('origin fallback is reported as the whole site, not this page', f.available && f.scope === 'origin' && /whole site/.test(f.note));
f = parseField({ loadingExperience: { initial_url: 'https://tiny.example/', id: 'https://tiny.example/' }, originLoadingExperience: { initial_url: 'https://tiny.example/' } });
check('no CrUX data gives available: false with the honest reason and no numbers', !f.available && /no real-visitor data/.test(f.reason) && f.metrics.includes('INP'));

// ---- fetching ----
process.env.AVARA_PSI = 'off'; let r = await fetchPsi('https://example.com/');
check('AVARA_PSI=off never calls Google', !r.field.available && /turned off/.test(r.field.reason)); delete process.env.AVARA_PSI;
globalThis.fetch = async () => { throw new Error('fetch must not be called'); };
r = await fetchPsi('http://127.0.0.1:4200/'); const r2 = await fetchPsi('http://localhost:3100/'); const r3 = await fetchPsi('http://10.0.0.5/');
check('private and local addresses are never sent to Google', [r, r2, r3].every((x) => !x.field.available && /not public/.test(x.field.reason)));
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
r = await fetchPsi('https://93.184.215.14/');
check('PSI unreachable: no throw, field unavailable with a reason, no lab', !r.field.available && /could not be reached/.test(r.field.reason) && r.lab === null);
globalThis.fetch = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
{ const keep = setInterval(() => {}, 1000); r = await fetchPsi('https://93.184.215.14/', { timeoutMs: 50 }); clearInterval(keep); } // a real socket keeps the loop alive; the fake does not
check('PSI slow: times out without failing', !r.field.available && /did not answer within/.test(r.field.reason));
respond(429, { error: { code: 429, message: "Quota exceeded for quota metric 'Queries'" } }); delete process.env.PAGESPEED_API_KEY;
r = await fetchPsi('https://93.184.215.14/');
check('quota exhausted (429) is said plainly, and mentions the missing key', !r.field.available && /quota is used up/.test(r.field.reason) && /PAGESPEED_API_KEY/.test(r.field.reason));
let sent = ''; globalThis.fetch = async (u) => { sent = String(u); return new Response(JSON.stringify({ loadingExperience: crux(), lighthouseResult: lhr }), { status: 200 }); };
process.env.PAGESPEED_API_KEY = 'test-key'; r = await fetchPsi('https://93.184.215.14/page#top'); delete process.env.PAGESPEED_API_KEY;
check('a good response returns field data and the Google lab run; the key and mobile strategy are sent, the fragment is not', r.field.available && r.lab?.lighthouseVersion === '13.0.1' && /key=test-key/.test(sent) && /strategy=mobile/.test(sent) && !/%23top/.test(sent));

// ---- fallback in the performance check ----
respond(200, { loadingExperience: crux(), lighthouseResult: lhr });
process.env.AVARA_FAIL_ANALYZER = 'perf-local';
const perf = await runLighthouse('https://93.184.215.14/');
check('if Avara\'s Lighthouse fails, Google\'s lab run is used and labelled as run by Google', perf.conditions.runBy === 'google' && /run by Google PageSpeed Insights \(not by Avara\)/.test(perf.conditions.tool) && perf.median.lcp === 3100 && !!perf.localError);
check('lab and field stay separate: the lab median is Lighthouse\'s, the field p75 is CrUX\'s', perf.median.lcp === 3100 && perf.field.available && perf.field.metrics.lcp.p75 === 2900);
respond(200, { loadingExperience: crux(), lighthouseResult: { ...lhr, runtimeError: { code: 'FAILED_DOCUMENT_REQUEST', message: 'Google could not load it' } } });
let threw = false; try { await runLighthouse('https://93.184.215.14/'); } catch { threw = true; }
check('if both lab runs fail, the performance check fails as before (the caller records it)', threw);
delete process.env.AVARA_FAIL_ANALYZER;

// ---- the INP detector ----
const inp = (field) => derivedReports({ viewports: [], perf: { audits: {}, field } })['perf/inp-field'];
const fd = (p75) => ({ ...parseField({ loadingExperience: crux({ metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: p75, category: p75 <= 200 ? 'FAST' : p75 <= 500 ? 'AVERAGE' : 'SLOW' } } }) }) });
check('INP detector: 150 ms field p75 passes', inp(fd(150)).ran && inp(fd(150)).hits.length === 0);
check('INP detector: 340 ms field p75 fails and says it is Google field data', inp(fd(340)).hits[0]?.bucket === 'confirmed_failure' && /Google's field data, not an Avara measurement/.test(inp(fd(340)).hits[0].summary));
check('INP detector: no field data does not run, with the reason', !inp(parseField({})).ran && /no real-visitor data/.test(inp(parseField({})).note));
check('INP detector: no performance result does not run', !derivedReports({ viewports: [], perf: null })['perf/inp-field'].ran);

globalThis.fetch = realFetch;
const failed = results.filter((x) => !x).length; console.log(failed ? `\n${failed} FAILED` : '\nAll passed'); process.exit(failed ? 1 : 0);
