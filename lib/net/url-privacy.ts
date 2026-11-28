// Secrets people paste by accident. A page address often carries a sign-in token, a reset code or an email in its query string or
// fragment; Avara has no use for them (it never signs in) and must not store, show or share them. Every address is passed through
// stripSecrets before it is saved, so reports, share links, exports and AI prompts never see the removed values.
const SECRET = /^(?:token|access_?token|id_?token|refresh_?token|auth|authorization|bearer|jwt|key|api_?key|apikey|secret|client_?secret|code|otp|session|session_?id|sessionid|sid|password|passwd|pass|pwd|signature|sig|hash|email|e-?mail|mail|phone|ticket|nonce|state|x-amz-[a-z-]+|x-goog-[a-z-]+)$/i;
const SECRETISH = /(?:token|secret|password|passwd|api_?key|session|signature|email)/i;

import { hasSecretShape } from '../../packages/security-exposure/patterns.ts';
export const isSecretParam = (name: string) => SECRET.test(name) || SECRETISH.test(name);

/** The same address without secret-bearing query parameters, and without a fragment that carries values (e.g. #access_token=…). */
const safeDecode = (x: string) => { try { return decodeURIComponent(x); } catch { return x; } };
export function stripSecrets(input: URL | string): URL {
  const u = new URL(input.toString());
  for (const name of [...new Set(u.searchParams.keys())]) if (isSecretParam(name)) u.searchParams.delete(name);
  for (const [name, value] of [...u.searchParams.entries()]) if (hasSecretShape(value)) u.searchParams.delete(name);   // a key under an ordinary parameter name
  if (hasSecretShape(safeDecode(u.pathname))) u.pathname = u.pathname.split('/').map((seg) => (hasSecretShape(safeDecode(seg)) ? '[removed]' : seg)).join('/');
  if (u.hash.includes('=') || hasSecretShape(safeDecode(u.hash))) u.hash = '';
  return u;
}
