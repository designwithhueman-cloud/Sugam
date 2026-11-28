// Milestone 0: a tiny customer app used as a known-outcome target for flow tests. In-memory, no database, test users only.
// createApp({ defects }) with no defects is Fixture A (correct). Fixture B is the same app with deliberate defects switched on:
//   save500         the save request answers HTTP 500
//   fakeToast       the page shows "Customer saved" even when the save failed; when the server does not 500 it also drops the record
//   crossUser       the customer list shows every user's records
//   deadCta         the "Upgrade plan" button goes nowhere
//   consoleError    the dashboard logs a console error
//   mobileOverflow  a fixed-width banner makes the dashboard scroll sideways on a phone
import http from 'node:http';
import crypto from 'node:crypto';

export const ALL_DEFECTS = ['save500', 'fakeToast', 'crossUser', 'deadCta', 'consoleError', 'mobileOverflow'];
// Test values only. These accounts exist nowhere else.
export const TEST_USERS = { alice: { email: 'alice@avara-test.local', password: 'fixture-pass-alice' }, bob: { email: 'bob@avara-test.local', password: 'fixture-pass-bob' } };
export const BOB_RECORD = 'Bob_Private_Customer';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const page = (title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px system-ui;margin:0;color:#1a1a1a}main{max-width:720px;margin:0 auto;padding:24px 16px}label{display:block}input{display:block;margin:6px 0 14px;padding:8px;width:100%;max-width:320px;box-sizing:border-box}
button,.btn{padding:8px 14px;border:1px solid #333;background:#fff;border-radius:6px;cursor:pointer;text-decoration:none;color:inherit;font:inherit}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}#toast{margin:12px 0;padding:8px 12px;background:#e7f6ea}#toast:empty{display:none}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

export function createApp({ defects = [], name = 'fixture' } = {}) {
  const D = new Set(defects), cookieName = `avara_${name}_sid`;
  const seed = () => [{ id: 'seed-bob-1', owner: 'bob', name: BOB_RECORD, email: 'bob-customer@avara-test.local' }];
  let customers = seed(); const sessions = new Map();   // sid -> user key

  const userKey = (email, password) => Object.entries(TEST_USERS).find(([, u]) => u.email === email && u.password === password)?.[0] ?? null;
  const sessionOf = (req) => { const m = (req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(cookieName + '=')); return m ? sessions.get(m.slice(cookieName.length + 1)) ?? null : null; };
  const visible = (user) => (D.has('crossUser') ? customers : customers.filter((c) => c.owner === user));
  const body = (req) => new Promise((resolve, reject) => { let n = 0; const b = []; req.on('data', (c) => { n += c.length; if (n > 65536) { reject(new Error('too large')); req.destroy(); } else b.push(c); }); req.on('end', () => resolve(Buffer.concat(b).toString())); req.on('error', reject); });
  const send = (res, code, type, text, headers = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...headers }); res.end(text); };
  const html = (res, text, code = 200) => send(res, code, 'text/html; charset=utf-8', text);
  const json = (res, code, obj) => send(res, code, 'application/json', JSON.stringify(obj));
  const redirect = (res, to, headers = {}) => send(res, 302, 'text/plain', '', { location: to, ...headers });

  const loginPage = (msg = '') => page('Sign in', `<h1>Sign in</h1>${msg ? `<p role="alert">${esc(msg)}</p>` : ''}
<form method="post" action="/login" id="login-form"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in</button></form>`);

  const dashboard = (user) => {
    const rows = visible(user).map((c) => `<tr data-testid="customer-row"><td>${esc(c.name)}</td><td>${esc(c.email)}</td></tr>`).join('');
    const cta = D.has('deadCta') ? '<button type="button" id="upgrade">Upgrade plan</button>' : '<a class="btn" id="upgrade" href="/plans">Upgrade plan</a>';
    return page('Dashboard', `<header><strong>${esc(TEST_USERS[user].email)}</strong>
<form method="post" action="/logout" style="display:inline"><button type="submit">Sign out</button></form></header>
<h1>Customers</h1>
${D.has('mobileOverflow') ? '<div style="width:640px;background:#fde;padding:8px">Spring promotion: everything is half price this week only</div>' : ''}
<p><a class="btn" href="/customers/new" id="add-customer">Add customer</a> ${cta}</p>
<table><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>${rows || '<tr><td colspan="2" data-testid="empty">No customers yet.</td></tr>'}</tbody></table>`,
      D.has('consoleError') ? `console.error('Failed to initialise analytics: window.analytics is undefined');` : '');
  };

  const newPage = () => page('New customer', `<h1>New customer</h1><div id="toast" role="status" aria-live="polite"></div>
<form id="customer-form"><label for="name">Name</label><input id="name" name="name" maxlength="100" required>
<label for="email">Email</label><input id="email" name="email" type="email" maxlength="200"><button type="submit" id="save">Save</button></form>
<p><a href="/dashboard">Back to customers</a></p>`,
    `const f=document.getElementById('customer-form'),t=document.getElementById('toast');
f.addEventListener('submit',async(e)=>{e.preventDefault();let ok=false;try{const r=await fetch('/api/customers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.name.value,email:f.email.value})});ok=r.ok;await r.text();}catch{}
${D.has('fakeToast') ? "t.textContent='Customer saved';" : "t.textContent=ok?'Customer saved':'Could not save the customer. Please try again.';"} });`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x'), p = url.pathname, user = sessionOf(req);
      if (req.method === 'POST' && p === '/__reset') { customers = seed(); sessions.clear(); return json(res, 200, { ok: true }); }   // test helper
      if (p === '/favicon.ico') return send(res, 204, 'image/x-icon', '');
      if (req.method === 'GET' && p === '/') return redirect(res, user ? '/dashboard' : '/login');
      if (req.method === 'GET' && p === '/login') return html(res, loginPage());
      if (req.method === 'POST' && p === '/login') {
        const f = new URLSearchParams(await body(req)); const key = userKey(f.get('email') ?? '', f.get('password') ?? '');
        if (!key) return html(res, loginPage('Email or password is not right.'), 401);
        const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, key);
        return redirect(res, '/dashboard', { 'set-cookie': `${cookieName}=${sid}; HttpOnly; SameSite=Lax; Path=/` });
      }
      if (req.method === 'POST' && p === '/logout') { return redirect(res, '/login', { 'set-cookie': `${cookieName}=; Max-Age=0; Path=/` }); }
      if (req.method === 'GET' && p === '/plans') return html(res, page('Plans', '<h1>Plans</h1><p>Pick a plan.</p><a href="/dashboard">Back</a>'));
      if (p === '/dashboard' || p === '/customers/new' || p.startsWith('/api/')) {
        if (!user) return p.startsWith('/api/') ? json(res, 401, { error: 'sign in first' }) : redirect(res, '/login');
        if (req.method === 'GET' && p === '/dashboard') return html(res, dashboard(user));
        if (req.method === 'GET' && p === '/customers/new') return html(res, newPage());
        if (req.method === 'GET' && p === '/api/customers') return json(res, 200, visible(user).map(({ id, name, email }) => ({ id, name, email })));
        if (req.method === 'POST' && p === '/api/customers') {
          let b; try { b = JSON.parse(await body(req)); } catch { return json(res, 400, { error: 'bad json' }); }
          const name = String(b?.name ?? '').trim(), email = String(b?.email ?? '').trim();
          if (!name || name.length > 100) return json(res, 422, { error: 'name is required' });
          if (D.has('save500')) return json(res, 500, { error: 'internal error' });
          if (D.has('fakeToast')) return json(res, 201, { id: 'dropped' });   // says yes, stores nothing
          const c = { id: crypto.randomUUID(), owner: user, name, email }; customers.push(c); return json(res, 201, { id: c.id });
        }
      }
      send(res, 404, 'text/plain', 'Not found');
    } catch (e) { send(res, 500, 'text/plain', 'error'); }
  });
  return server;
}
