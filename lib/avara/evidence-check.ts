// Checks a "cannot be used" claim against the measurement it rests on. An action that is 0% visible, cut off by a container that shows none of it, and
// ignores taps looks exactly like a link inside a closed menu: Avara did not open the menu, so the measurement cannot prove a visitor is blocked.
// Used by the detector for new scans and, at read time, against the saved evidence of older scans (which are never rewritten).
export type MeasuredAction = { visibleRatio?: number | null; clippedBy?: string | null; pointerEventsNone?: boolean; reasons?: string[] | null };
export function collapsedContainer(m: MeasuredAction | null | undefined): string | null {
  if (!m || m.visibleRatio !== 0 || !m.clippedBy) return null;
  const ignores = m.pointerEventsNone ?? (m.reasons ?? []).some((r) => /pointer-events: none/.test(r));
  return ignores ? m.clippedBy : null;
}
export const collapsedNote = (container: string) => `It sits inside ${container}, which shows none of it, and it ignores taps. That is how a closed menu looks. Avara did not open the menu, so the evidence does not prove a visitor cannot reach it.`;
/** Repairs a sentence where all-caps button text had its first letter lower-cased ("bOOK A CALL"). */
export const fixCaps = (s: string) => s.replace(/\b([a-z])([A-Z]{2,})/g, (_, a: string, b: string) => a.toUpperCase() + b);
