// Fixture for journey discovery: a small marketing site with a two-click booking journey (Home → Book a call → Choose a time → calendar), duplicate links to
// the same page, links discovery must never follow (delete, log out, an external site, mail, a file), and switchable states:
//   state.mode = 'ok' | 'broken-calendar' (the calendar is gone from the last page) | 'broken-link' (“Choose a time” leads to a missing page) | 'changed' (the home link is renamed and moved to /schedule)
// `server.hits` records every path requested, so a test can prove which pages were never visited.
import http from 'node:http';

const shell = (title, body, book = '/book') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><header><nav><a href="/">Acme</a> <a href="/pricing">Pricing</a> <a href="/about">About</a> NAV_BOOK</nav></header><main>${body}</main>
<footer><a href="${book}/">Book a call</a> <a href="${book}?ref=footer">Book a call</a> <a href="/delete">Delete account</a> <a href="/logout">Log out</a> <a href="https://example.org/partner">Partner site</a> <a href="mailto:hi@acme.test">Email us</a> <a href="/brochure.pdf">Brochure</a></footer></body></html>`;

export function createJourneySite({ mode = 'ok' } = {}) {
  const state = { mode }; const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname; hits.push(p); const send = (code, html) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); };
    const changed = state.mode === 'changed'; const book = changed ? '/schedule' : '/book'; const bookText = changed ? 'Schedule a demo' : 'Book a call';
    const nav = (html) => html.replace('NAV_BOOK', `<a href="${book}">${bookText}</a>`);
    if (p === '/') return send(200, nav(shell('Acme Studio', '<h1>Acme Studio</h1><p>We make things.</p>', book)));
    if (p === '/pricing') return send(200, nav(shell('Pricing', '<h1>Pricing</h1><p>Simple plans.</p>', book)));
    if (p === '/about') return send(200, nav(shell('About', '<h1>About us</h1><p>A small team.</p>', book)));
    if (p === '/book' || p === '/book/' || p === '/schedule') return send(200, nav(shell(bookText, `<h1>${bookText}</h1><p>Pick a slot with our team.</p><a href="${p.startsWith('/sch') ? '/schedule' : '/book'}/${state.mode === 'broken-link' ? 'missing' : 'calendar'}">Choose a time</a>`, book)));
    if (p === '/book/calendar' || p === '/schedule/calendar') return send(200, nav(shell('Pick a time', state.mode === 'broken-calendar' ? '<h1>Pick a time</h1><p>Sorry, no times are available.</p>' : '<h1>Pick a time</h1><div id="booking-calendar" role="grid" aria-label="Booking calendar"><button type="button">Mon 10:00</button><button type="button">Tue 14:00</button></div>', book)));
    if (p === '/delete' || p === '/logout' || p === '/brochure.pdf') return send(200, '<h1>Done</h1>');
    return send(404, '<h1>Not found</h1>');
  });
  server.state = state; server.hits = hits; return server;
}
