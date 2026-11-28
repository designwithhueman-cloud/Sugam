// SSRF protection for the scan worker. Used to validate the submitted URL and every
// request the headless browser makes (see scanner/scanner.ts).
import dns from 'node:dns/promises';
import net from 'node:net';
import { stripSecrets } from './url-privacy.ts';

const v4 = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) v4.addSubnet(a, p, 'ipv4');

function expandV6(ip: string): number[] {
  let s = ip.toLowerCase().split('%')[0];
  if (s.includes('.')) { const i = s.lastIndexOf(':'); const q = s.slice(i + 1).split('.').map(Number); s = s.slice(0, i + 1) + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16); }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : []; const t = tail ? tail.split(':') : [];
  const fill = s.includes('::') ? Array(8 - h.length - t.length).fill('0') : [];
  return [...h, ...fill, ...t].map((g) => parseInt(g || '0', 16));
}
const toV4 = (a: number, b: number) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4.check(ip, 'ipv4');
  if (!net.isIPv6(ip)) return true;
  const g = expandV6(ip);
  if (g.every((x) => x === 0)) return true;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isBlockedIp(toV4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) return isBlockedIp(toV4(g[6], g[7]));
  if (g[0] === 0x2002) return isBlockedIp(toV4(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00) return true;
  return g[0] === 0x2001 && g[1] === 0x0db8;
}

export class BlockedUrlError extends Error {
  code: string;
  constructor(message: string, code = 'blocked') { super(message); this.code = code; }
}
// Test-only allow-list, e.g. ALLOW_PRIVATE_HOSTS=127.0.0.1:4200 for the local fixture.
const allowList = () => (process.env.ALLOW_PRIVATE_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const cache = new Map<string, { ok: boolean; at: number }>();

/** Validates an address for scanning and returns it with secret parameters removed (see url-privacy.ts). */
export async function checkUrl(input: string): Promise<URL> { return stripSecrets(await checkUrlRaw(input)); }
async function checkUrlRaw(input: string): Promise<URL> {
  let u: URL;
  try { u = new URL(input); } catch { throw new BlockedUrlError('That does not look like a valid web address.', 'invalid_url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError('Only http and https addresses can be scanned.', 'invalid_url');
  if (u.username || u.password) throw new BlockedUrlError('Addresses containing a username or password cannot be scanned.', 'invalid_url');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (allowList().includes(`${host}:${port}`)) return u;
  if (port !== '80' && port !== '443') throw new BlockedUrlError('Only standard web ports (80 and 443) can be scanned.');
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host) || (!host.includes('.') && !net.isIP(host))) throw new BlockedUrlError('That address points to a private or internal network, so it cannot be scanned.');
  const key = host; const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) { if (!hit.ok) throw new BlockedUrlError('That address resolves to a private or internal network, so it cannot be scanned.'); return u; }
  let addrs: { address: string }[];
  if (net.isIP(host)) addrs = [{ address: host }];
  else { try { addrs = await dns.lookup(host, { all: true, verbatim: true }); } catch { throw new BlockedUrlError('We could not find that website (DNS lookup failed).', 'dns_failed'); } }
  const ok = addrs.length > 0 && !addrs.some((a) => isBlockedIp(a.address));
  cache.set(key, { ok, at: Date.now() });
  if (!ok) throw new BlockedUrlError('That address resolves to a private or internal network, so it cannot be scanned.');
  return u;
}
