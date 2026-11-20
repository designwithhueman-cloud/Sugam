// Defensive review of this project's own source. Local files only: no network, no probing of any site. Prints findings for a person to read;
// it changes nothing. Patterns are the usual review starting points (code execution from strings, raw HTML injection, shell built from input, secrets in code).
import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(); const SKIP = new Set(['node_modules', '.next', '.data', 'audit-output', '.git', 'fixture']);
const PATTERNS = [
  ['eval-or-Function', /\b(eval\s*\(|new Function\s*\()/, 'Runs a string as code.'],
  ['raw-html', /dangerouslySetInnerHTML|\.innerHTML\s*=/, 'Writes unescaped HTML; check the value is trusted or sanitised.'],
  ['shell-from-input', /\b(exec|execSync)\s*\(\s*[`'"].*\$\{/, 'Builds a shell command from a value; use execFile with an argument list.'],
  ['hard-coded-secret', /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, 'Looks like a credential in source.'],
  ['tls-off', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/, 'Turns off certificate checks.'],
];
const found = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (SKIP.has(e.name)) continue; const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (p.endsWith('local-source-review.mjs')) continue; else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !p.includes(`${path.sep}test${path.sep}`)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { for (const [id, re, why] of PATTERNS) if (re.test(l)) found.push({ id, file: path.relative(ROOT, p), line: i + 1, why, text: l.trim().slice(0, 120) }); });
  } } })(ROOT);
console.log(JSON.stringify({ reviewed: 'local source only', count: found.length, findings: found }, null, 1));
