import { readFileSync } from "node:fs";
const rule = JSON.parse(readFileSync(new URL("./rule.json", import.meta.url)));
export function compareHero(sample, references) {
  const base = { ruleId: rule.ruleId, version: rule.version, weight: 0, publish: false };
  const skipped = reason => ({ ...base, status: "not-run", reason });
  const validViewport = v => Array.isArray(v) && v.length === 2 && v.every(x => Number.isInteger(x) && x > 0);
  if (!validViewport(sample?.viewport) || !sample.features) return skipped(sample?.skip || "Capture missing");
  const {groups, minimumGroups, positionTolerance} = rule.parameters;
  const candidates = [];
  for (const ref of references ?? []) {
    if (!ref?.id || !ref.origin || !ref.rights || !ref.features || !validViewport(ref.viewport)) continue;
    if (ref.viewport.some((x,i) => x !== sample.viewport[i])) continue;
    const evidence = [];
    for (const [group, keys] of Object.entries(groups)) {
      if (!keys.every(k => Number.isFinite(sample.features[k]) && Number.isFinite(ref.features[k]))) continue;
      const observations = keys.map(key => ({ key, page: sample.features[key], reference: ref.features[key] }));
      const delta = Math.max(...observations.map(o => Math.abs(o.page - o.reference)));
      evidence.push({ group, delta, matches: delta <= positionTolerance, observations });
    }
    if (evidence.length >= minimumGroups) candidates.push({
      referenceId: ref.id, evidence, matchedGroups: evidence.filter(e => e.matches).length,
      distance: evidence.reduce((sum, e) => sum + e.delta, 0) / evidence.length
    });
  }
  candidates.sort((a,b) => b.matchedGroups - a.matchedGroups || a.distance - b.distance || a.referenceId.localeCompare(b.referenceId));
  if (!candidates.length) return skipped("No comparable same-viewport reference with sufficient measurements");
  return { ...base, status: "diagnostic", candidates };
}
