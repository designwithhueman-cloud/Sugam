// A bullet is shown only when it has words in it. Stored fix steps end with a newline and some evidence lists carry blank entries; neither may render
// as an empty bullet.
const blank = (s: unknown) => typeof s !== 'string' || !s.replace(/[\s•·.,:;–-]/g, '');
export const nonEmpty = (xs: readonly unknown[] | null | undefined): string[] => (xs ?? []).filter((s): s is string => !blank(s)).map((s) => s.trim());
/** Numbered or bulleted lines from a stored text block, without their markers and without blank lines. */
export const bulletLines = (text: string | null | undefined): string[] => nonEmpty((text ?? '').split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '')));
