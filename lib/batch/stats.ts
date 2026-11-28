// The numbers a labeled batch produces: false-positive rate per check with a Wilson 95% interval, unsure counts, and recall on planted bugs.
export const MIN_LABELS = 10;   // decisive labels (correct + false positive) needed before a rate is shown
export const VERDICTS = ['correct', 'false_positive', 'unsure'] as const;
export type Verdict = typeof VERDICTS[number];

/** Wilson score interval for k of n at 95%. Returns null when n is 0. */
export function wilson(k: number, n: number, z = 1.959964): { lo: number; hi: number } | null {
  if (n <= 0) return null;
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}

export type FindingLabel = { finding_id: string; check_id: string; kind: string; site_id: string; reviewer_verdict: string };
export type CheckStats = { check: string; kind: string; findings: number; unlabeled: number; correct: number; falsePositive: number; unsure: number; decisive: number;
  enough: boolean; fpRate: number | null; lo: number | null; hi: number | null };

/** Per check. A rate is computed only from decisive labels, and only shown once there are MIN_LABELS of them. */
export function perCheck(rows: FindingLabel[]): { checks: CheckStats[]; invalid: { finding_id: string; value: string }[] } {
  const by = new Map<string, CheckStats>(); const invalid: { finding_id: string; value: string }[] = [];
  for (const r of rows) {
    const key = `${r.kind}|${r.check_id}`; let s = by.get(key);
    if (!s) { s = { check: r.check_id, kind: r.kind, findings: 0, unlabeled: 0, correct: 0, falsePositive: 0, unsure: 0, decisive: 0, enough: false, fpRate: null, lo: null, hi: null }; by.set(key, s); }
    s.findings++;
    const v = r.reviewer_verdict.trim().toLowerCase();
    if (v === '') s.unlabeled++; else if (v === 'correct') s.correct++; else if (v === 'false_positive') s.falsePositive++; else if (v === 'unsure') s.unsure++; else { invalid.push({ finding_id: r.finding_id, value: r.reviewer_verdict }); s.unlabeled++; }
  }
  for (const s of by.values()) {
    s.decisive = s.correct + s.falsePositive; s.enough = s.decisive >= MIN_LABELS;
    if (s.enough) { s.fpRate = s.falsePositive / s.decisive; const w = wilson(s.falsePositive, s.decisive)!; s.lo = w.lo; s.hi = w.hi; }
  }
  return { checks: [...by.values()].sort((a, b) => a.check.localeCompare(b.check)), invalid };
}

export type Planted = { check: string; selector?: string; note?: string };
export type PlantedResult = { site: string; planted: Planted; found: boolean };
/** A planted bug counts as found when the site has a finding for that check (and, if the entry names a selector, one that contains it). */
export function plantedRecall(sites: { id: string; planted?: Planted[] }[], findings: { site_id: string; check_id: string; selector: string }[]): { results: PlantedResult[]; byCheck: { check: string; planted: number; found: number; recall: number }[] } {
  const results: PlantedResult[] = [];
  for (const s of sites) for (const p of s.planted ?? []) results.push({ site: s.id, planted: p, found: findings.some((f) => f.site_id === s.id && f.check_id === p.check && (!p.selector || f.selector.includes(p.selector))) });
  const m = new Map<string, { planted: number; found: number }>();
  for (const r of results) { const x = m.get(r.planted.check) ?? { planted: 0, found: 0 }; x.planted++; if (r.found) x.found++; m.set(r.planted.check, x); }
  return { results, byCheck: [...m].map(([check, x]) => ({ check, ...x, recall: x.found / x.planted })).sort((a, b) => a.check.localeCompare(b.check)) };
}
