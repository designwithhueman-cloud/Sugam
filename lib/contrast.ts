// WCAG colour contrast maths, shared by the fix prompts (server) and the free contrast checker (browser).
export function hexToRgb(h: string): [number, number, number] | null {
  const m = String(h).trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return null;
  const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
export const lum = ([r, g, b]: number[]) => { const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export function suggestForeground(fg: string, bg: string, target: number): { color: string; ratio: number } | null {
  const f = hexToRgb(fg), b = hexToRgb(bg); if (!f || !b) return null;
  const towards = lum(b) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = f.map((v, i) => v + (towards[i] - v) * t);
    const r = ratio(c, b); if (r >= target) return { color: toHex(c), ratio: Math.round(r * 100) / 100 };
  }
  return null;
}

