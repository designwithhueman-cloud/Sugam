// Fixture for the exposure checks. createLeakyApp({ leaky: true }) ships a service key, a Stripe-style key, a .env, a .git folder, a source map and an
// open database table. createLeakyApp({ leaky: false }) is a clean single-page app that answers HTTP 200 (the home page) for EVERY path, to prove the
// checks do not mistake that catch-all for a leaked file. `server.state` can be changed while it runs, to simulate a fix or a new mistake.
// Fake keys are assembled at run time so no key-shaped string sits in the repository.
import http from 'node:http';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${'sig'.repeat(8)}`;
export const REF = 'fixtureproj';
export const ANON = jwt({ iss: 'supabase', ref: REF, role: 'anon' });
export const SERVICE = jwt({ iss: 'supabase', ref: REF, role: 'service_role' });
export const STRIPE = ['sk', 'live', 'FIXTUREFIXTUREFIXTURE12'].join('_');
export const OPEN_ROW = { id: 1, email: 'private-person@avara-test.local', note: 'FIXTURE_ROW_VALUE' };

export function createLeakyApp({ leaky = true } = {}) {
  const state = { secrets: leaky, files: leaky, maps: leaky, table: leaky, token: '' };   // token: the site-ownership line, once someone has added it
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x'); const p = url.pathname;
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
    const code = `const sb=createClient("/", "${ANON}"); ${state.secrets ? `const admin="${SERVICE}"; const pay="${STRIPE}";` : ''} sb.from("customers").select(); sb.from("private_notes").select();`;
    const index = `<!doctype html><html><head><title>App</title>${state.token ? `<meta name="avara-site-verification" content="${state.token}">` : ''}</head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>`;
    if (p.startsWith('/rest/v1')) {   // a mock of the database API
      if (req.headers.apikey !== ANON) return send(401, 'application/json', '{"message":"Invalid API key"}');
      if (p === '/rest/v1/' || p === '/rest/v1') return send(200, 'application/openapi+json', JSON.stringify({ paths: { '/': {}, '/customers': {}, '/private_notes': {}, '/rpc/do_thing': {} } }));
      if (p === '/rest/v1/customers') return send(200, 'application/json', JSON.stringify(state.table ? [OPEN_ROW] : []));   // row-level security hides everything when off
      if (p === '/rest/v1/private_notes') return send(200, 'application/json', '[]');
      return send(404, 'application/json', '{"message":"not found"}');
    }
    if (p === '/assets/app.js') return send(200, 'application/javascript', code);
    if (state.maps && p === '/assets/app.js.map') return send(200, 'application/json', JSON.stringify({ version: 3, sources: ['src/App.tsx'], sourcesContent: ['export const x = 1;'], mappings: '' }));
    if (state.files && p === '/.env') return send(200, 'text/plain', 'DATABASE_URL=postgres://user:pass@db/x\nSTRIPE_KEY=abc\n');
    if (state.files && p === '/.git/config') return send(200, 'text/plain', '[core]\n\trepositoryformatversion = 0\n');
    if (p === '/' || !leaky) return send(200, 'text/html; charset=utf-8', index);   // clean app: single-page fallback, HTTP 200 for every path
    send(404, 'text/plain', 'Not found');
  });
  server.state = state; return server;
}
