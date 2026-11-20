// Client address for rate limiting. Behind one trusted proxy, the proxy appends the real client
// address as the LAST x-forwarded-for entry; earlier entries are supplied by the client and can be
// spoofed. Set TRUST_PROXY=0 to ignore the header entirely (all anonymous callers then share one bucket).
export function clientIp(h: Headers): string {
  if (process.env.TRUST_PROXY === '0') return 'local';
  const parts = (h.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || 'local';
}
