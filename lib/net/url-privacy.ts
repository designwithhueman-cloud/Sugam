// Secrets people paste by accident. A page address often carries a sign-in token, a reset code or an email in its query string or
// fragment; Avara has no use for them (it never signs in) and must not store, show or share them. Every address is passed through
// stripSecrets before it is saved, so reports, share links, exports and AI prompts never see the removed values.
const SECRET = /^(?:token|access_?token|id_?token|refresh_?token|auth|authorization|bearer|jwt|key|api_?key|apikey|secret|client_?secret|code|otp|session|session_?id|sessionid|sid|password|passwd|pass|pwd|signature|sig|hash|email|e-?mail|mail|phone|ticket|nonce|state|x-amz-[a-z-]+|x-goog-[a-z-]+)$/i;
const SECRETISH = /(?:token|secret|password|passwd|api_?key|session|signature|email)/i;

export const isSecretParam = (name: string) => SECRET.test(name) || SECRETISH.test(name);

/** The same address without secret-bearing query parameters, and without a fragment that carries values (e.g. #access_token=…). */
export function stripSecrets(input: URL | string): URL {
  const u = new URL(input.toString());
  for (const name of [...new Set(u.searchParams.keys())]) if (isSecretParam(name)) u.searchParams.delete(name);
  if (u.hash.includes('=')) u.hash = '';
  return u;
}
