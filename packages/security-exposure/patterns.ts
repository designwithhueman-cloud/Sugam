// The one table of secret-shaped values. The Launch check uses it to FIND leaks; redaction (lib/security/redact.ts) uses it to HIDE values.
// Pure: no imports and no I/O, so the scanner, the worker and the tests can share it. Detection is pattern-based only: no entropy rule, so UUIDs,
// hashes and ordinary long strings are never touched. A match for a public-by-design key (Google AIza, Supabase anon JWT) is hidden in stored
// evidence but is NOT a leak: a recognisable prefix alone does not establish one.
// prefixes: the well-known leading text shown after masking (the first that matches; the last is the default). prefixLen: a fixed number of leading characters.
export type SecretKind = { id: string; name: string; leak: boolean; severity: 'critical' | 'high' | 'medium'; re: RegExp; prefixes?: string[]; prefixLen?: number };

export const KINDS: SecretKind[] = [
  { id: 'stripe_live', name: 'Stripe live secret key', leak: true, severity: 'critical', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/g, prefixes: ['sk_live_'] },
  { id: 'stripe_restricted', name: 'Stripe restricted key', leak: true, severity: 'critical', re: /\brk_live_[0-9a-zA-Z]{20,}\b/g, prefixes: ['rk_live_'] },
  { id: 'stripe_test', name: 'Stripe test secret key', leak: true, severity: 'medium', re: /\bsk_test_[0-9a-zA-Z]{20,}\b/g, prefixes: ['sk_test_'] },
  { id: 'anthropic', name: 'Anthropic API key', leak: true, severity: 'critical', re: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/g, prefixes: ['sk-ant-'] },
  { id: 'openai', name: 'OpenAI API key', leak: true, severity: 'critical', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g, prefixes: ['sk-proj-', 'sk-'] },
  { id: 'aws', name: 'AWS access key', leak: true, severity: 'critical', re: /\bAKIA[0-9A-Z]{16}\b/g, prefixes: ['AKIA'] },
  { id: 'github', name: 'GitHub token', leak: true, severity: 'critical', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, prefixLen: 4 },
  { id: 'slack', name: 'Slack token', leak: true, severity: 'high', re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, prefixLen: 5 },
  { id: 'supabase_secret', name: 'Supabase secret key', leak: true, severity: 'critical', re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, prefixes: ['sb_secret_'] },
  { id: 'google_api', name: 'Google API key', leak: false, severity: 'medium', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, prefixes: ['AIza'] },
];
export const PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/g;
export const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
export const MASK = '••••';
export const PRIVATE_KEY_MASK = '[private key removed]';

export function jwtPayload(t: string): Record<string, unknown> | null { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')); } catch { return null; } }
/** What a JWT is, from its role claim: service_role is a leak; anon is public by design (a Supabase key); anything else is some other token. */
export function jwtKind(t: string): { id: 'jwt_service' | 'jwt_anon' | 'jwt_other'; name: string; leak: boolean; ref?: string } {
  const p = jwtPayload(t); const ref = typeof p?.ref === 'string' ? p.ref : undefined;
  if (p?.role === 'service_role') return { id: 'jwt_service', name: 'Supabase service key (full database access)', leak: true, ref };
  if (p?.role === 'anon') return { id: 'jwt_anon', name: 'Supabase public (anon) key', leak: false, ref };
  return { id: 'jwt_other', name: 'JWT', leak: false, ref };
}
/** The replacement for one match: the well-known prefix and nothing after it. Never contains any character of the secret itself. */
export const prefixOf = (k: SecretKind, m: string) => (k.prefixes ? (k.prefixes.find((p) => m.startsWith(p)) ?? k.prefixes[k.prefixes.length - 1]) : m.slice(0, k.prefixLen ?? 0));
export const maskedForm = (k: SecretKind, m: string) => `${prefixOf(k, m)}${MASK}`;
export const maskedJwt = () => `eyJ${MASK}`;

const nonGlobal = (re: RegExp) => new RegExp(re.source, re.flags.replace('g', ''));
const SHAPES = [...KINDS.map((k) => nonGlobal(k.re)), nonGlobal(JWT), nonGlobal(PRIVATE_KEY)];
/** True when the text contains a secret-shaped value. Used on web addresses, where a key can sit in a path segment or a parameter with an ordinary name. */
export const hasSecretShape = (s: string) => SHAPES.some((re) => re.test(s));
