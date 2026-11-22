// Egress proxy for the headless browser. Every request the page makes (including each
// redirect hop, sub-resource and WebSocket) goes through here. Destinations are resolved,
// checked against private/internal ranges, and the socket is connected to the checked
// IP, so DNS rebinding cannot reach an internal service.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { isBlockedIp } from '../lib/net/guard.ts';

export type EgressStats = { requests: number; blocked: string[]; capped: number };

function allowList(): string[] { return (process.env.ALLOW_PRIVATE_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }

async function resolveAllowed(host: string, port: number): Promise<string> {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = allowList().includes(`${h}:${port}`);
  if (!allowed && port !== 80 && port !== 443) throw new Error('port');
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true, verbatim: true });
  if (!addrs.length) throw new Error('dns');
  if (!allowed && addrs.some((a) => isBlockedIp(a.address))) throw new Error('private');
  return addrs[0].address;
}

export async function startEgressProxy({ maxRequests = 800 } = {}): Promise<{ url: string; stats: EgressStats; close: () => Promise<void> }> {
  const stats: EgressStats = { requests: 0, blocked: [], capped: 0 };
  const sockets = new Set<net.Socket>();
  const deny = (what: string) => { if (stats.blocked.length < 50 && !stats.blocked.includes(what)) stats.blocked.push(what); };

  const server = http.createServer(async (req, res) => {
    // Plain-HTTP requests arrive in absolute form: GET http://host/path
    let target: URL;
    try { target = new URL(req.url || ''); } catch { res.writeHead(400).end(); return; }
    if (++stats.requests > maxRequests) { stats.capped++; res.writeHead(429).end(); return; }
    const port = Number(target.port || 80);
    let ip: string;
    try { ip = await resolveAllowed(target.hostname, port); } catch { deny(`${target.hostname}:${port}`); res.writeHead(403).end('blocked by Avara egress policy'); return; }
    const headers = { ...req.headers }; delete headers['proxy-connection']; delete headers['proxy-authorization'];
    const up = http.request({ host: ip, port, method: req.method, path: target.pathname + target.search, headers, setHost: false }, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });

  // HTTPS and WebSocket-over-TLS: CONNECT host:port
  server.on('connect', async (req, client: net.Socket, head) => {
    sockets.add(client); client.on('close', () => sockets.delete(client)); client.on('error', () => {});
    const [host, p] = String(req.url || '').split(/:(?=\d+$)/);
    const port = Number(p || 443);
    if (++stats.requests > maxRequests) { stats.capped++; client.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
    let ip: string;
    try { ip = await resolveAllowed(host, port); } catch { deny(`${host}:${port}`); client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const up = net.connect(port, ip, () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head && head.length) up.write(head); up.pipe(client); client.pipe(up); });
    sockets.add(up); up.on('close', () => sockets.delete(up));
    up.on('error', () => client.destroy());
  });
  server.on('upgrade', (_req, socket: net.Socket) => socket.destroy()); // plain ws:// is refused
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`, stats,
    close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}
