// Synthetic canary secrets for the redaction tests. Assembled at run time from random characters, so no key-shaped string sits in the repository
// (and none of these is a real credential). Every value matches the pattern of the kind it stands for.
import crypto from 'node:crypto';
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const rnd = (n, set = ALNUM) => Array.from(crypto.randomBytes(n), (b) => set[b % set.length]).join('');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${rnd(24)}`;
export function makeCanaries() {
  return {
    stripe: ['sk', 'live', rnd(24)].join('_'), restricted: ['rk', 'live', rnd(24)].join('_'), stripeTest: ['sk', 'test', rnd(24)].join('_'),
    openai: 'sk-' + rnd(48), openaiProject: 'sk-proj-' + rnd(48), anthropic: 'sk-ant-' + rnd(40), aws: 'AKIA' + rnd(16, UP), github: 'ghp_' + rnd(36), slack: 'xoxb-' + rnd(24),
    supabaseSecret: 'sb_secret_' + rnd(30), google: 'AIza' + rnd(35),
    serviceJwt: jwt({ iss: 'supabase', ref: 'canaryproj', role: 'service_role' }), anonJwt: jwt({ iss: 'supabase', ref: 'canaryproj', role: 'anon' }), userJwt: jwt({ sub: rnd(12), role: 'authenticated' }),
    privateKey: `-----BEGIN PRIVATE KEY-----\n${rnd(64)}\n${rnd(64)}\n-----END PRIVATE KEY-----`,
    param: rnd(20),
  };
}
/** Values that must never appear anywhere after masking. */
export const RAW = (c) => Object.entries(c).filter(([k]) => k !== 'privateKey').map(([, v]) => v).concat([c.privateKey.split('\n')[1]]);
export { rnd };
