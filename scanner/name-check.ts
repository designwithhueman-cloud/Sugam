// Before Avara offers "remove the aria-label" as paste-ready code, it tests that edit on a temporary copy: the control is cloned without its
// aria-label (ids stripped, placed off-screen next to the original), the browser's own accessibility tree names the copy, and the copy is
// removed again. The removal is safe only when that name is meaningful and contains the control's visible label. Read-only for the page.
import type { Page } from 'playwright';

export type NameCheck = { safe: boolean; name: string; visible: string; reason: string };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function checkAriaLabelRemoval(page: Page, selectors: string[]): Promise<Record<string, NameCheck>> {
  const out: Record<string, NameCheck> = {};
  for (const sel of [...new Set(selectors)].slice(0, 10)) {
    let visible = '';
    try {
      const made = await page.evaluate((s) => {
        const all = document.querySelectorAll(s); if (all.length !== 1) return null;
        const el = all[0] as HTMLElement; const c = el.cloneNode(true) as HTMLElement;
        c.removeAttribute('aria-label'); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
        c.setAttribute('data-avara-namecheck', '1'); c.style.setProperty('position', 'absolute', 'important'); c.style.setProperty('left', '-10000px', 'important'); c.style.setProperty('top', '0', 'important');
        el.after(c); return (el.innerText || '').replace(/\s+/g, ' ').trim();
      }, sel);
      if (made === null) { out[sel] = { safe: false, name: '', visible: '', reason: 'the selector does not match exactly one element' }; continue; }
      visible = made;
      const snap = await page.locator('[data-avara-namecheck]').ariaSnapshot({ timeout: 2000 });
      const name = snap.split('\n')[0].match(/^-\s+[\w-]+(?:\s+"((?:[^"\\]|\\.)*)")?/)?.[1]?.replace(/\\"/g, '"') ?? '';
      const ok = visible.length >= 2 && name.length >= 2 && norm(name).includes(norm(visible));
      out[sel] = { safe: ok, name, visible, reason: ok ? `without the aria-label it is named “${name}”` : name ? `without the aria-label it would be named “${name}”, which does not contain its visible text “${visible}”` : 'without the aria-label it would have no accessible name' };
    } catch (e) {
      out[sel] = { safe: false, name: '', visible, reason: `the test did not complete (${(e as Error).message.split('\n')[0].slice(0, 80)})` };
    } finally {
      await page.evaluate(() => document.querySelectorAll('[data-avara-namecheck]').forEach((n) => n.remove())).catch(() => {});
    }
  }
  return out;
}
