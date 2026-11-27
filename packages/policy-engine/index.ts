// Action safety for saved flows (milestone 3). Decides, before each step runs, whether it is safe to perform on someone's site.
// Default is deny for anything that can change state or leave the site: form submits, purchase/delete/send style actions, links to other
// origins, sensitive fields, and Enter inside a form. Overrides are set by the host code that starts a run (PolicyOptions), never by the
// flow JSON, so an untrusted flow cannot widen its own permissions.
import type { Page } from 'playwright';
import type { Step } from '../contracts/index.ts';

export type PolicyRule = 'submit' | 'destructive_text' | 'destructive_link' | 'cross_origin' | 'sensitive_field' | 'enter_in_form' | 'unreadable_target';
export type PolicyDecision = { allow: true } | { allow: false; rule: PolicyRule; reason: string };
export type PolicyOptions = { startUrl: string; allowSubmit?: boolean; allowDestructive?: boolean; allowCrossOrigin?: boolean; allowSensitiveFields?: boolean };

export type Target = { tag: string; type: string; text: string; href: string; inForm: boolean; formMethod: string; autocomplete: string; fieldName: string };

// Words that mean the click spends money, deletes, publishes or sends something. Matched as whole words in the visible label, aria-label or title.
export const DESTRUCTIVE_WORDS = /\b(delete|remove|erase|destroy|deactivate|close account|cancel (?:my |your )?(?:subscription|account|plan|order)|unsubscribe|buy|purchase|pay|place order|checkout|confirm (?:order|payment|purchase)|subscribe|donate|transfer|send|publish|post|submit|sign out|log ?out|reset)\b/i;
export const DESTRUCTIVE_PATH = /\/(logout|signout|delete|remove|destroy|checkout|cart\/add|purchase|unsubscribe|cancel|close-account)(?:[/?#]|$)/i;
const SENSITIVE_FIELD = /(card|cvv|cvc|ssn|social.?security|iban|routing|account.?number|passcode|password|otp|one.?time)/i;
const SENSITIVE_AUTOCOMPLETE = /(cc-|current-password|new-password|one-time-code)/i;

/** Reads what a visitor would see about the element a step targets, in the page itself. */
async function inspect(page: Page, selector: string): Promise<Target | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null; if (!el) return null;
    const f = el.closest('form') as HTMLFormElement | null; const i = el as HTMLInputElement;
    const text = [(el.innerText || '').trim(), i.value && /^(submit|button|reset)$/.test(i.type ?? '') ? i.value : '', el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''].join(' ').replace(/\s+/g, ' ').trim();
    return { tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') ?? '').toLowerCase(), text: text.slice(0, 200), href: (el as HTMLAnchorElement).href ?? '', inForm: !!f, formMethod: f ? (f.method || 'get').toLowerCase() : '',
      autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase(), fieldName: [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].filter(Boolean).join(' ') };
  }, selector).catch(() => null);
}

const origin = (u: string) => { try { return new URL(u).origin; } catch { return ''; } };
const deny = (rule: PolicyRule, reason: string): PolicyDecision => ({ allow: false, rule, reason: `Blocked by policy (${rule.replace(/_/g, ' ')}): ${reason}` });

/** Pure classification of a click target. Exported so it can be tested without a browser. */
export function classifyClick(t: Target, o: PolicyOptions): PolicyDecision {
  const submits = (t.tag === 'button' && (t.type === '' || t.type === 'submit') && t.inForm) || (t.tag === 'input' && t.type === 'submit') || (t.tag === 'input' && t.type === 'image');
  if (submits && !o.allowSubmit) return deny('submit', `“${t.text || t.tag}” submits a form${t.formMethod === 'post' ? ' (POST)' : ''}.`);
  if (!o.allowDestructive) {
    if (DESTRUCTIVE_WORDS.test(t.text)) return deny('destructive_text', `“${t.text.slice(0, 60)}” looks like an action that changes, spends or sends something.`);
    if (t.href && DESTRUCTIVE_PATH.test(safePath(t.href))) return deny('destructive_link', `the link goes to ${safePath(t.href).slice(0, 60)}, which looks like a state-changing address.`);
  }
  if (t.href && !o.allowCrossOrigin && origin(t.href) && origin(t.href) !== origin(o.startUrl)) return deny('cross_origin', `the link leaves the site (${new URL(t.href).host}).`);
  return { allow: true };
}
const safePath = (h: string) => { try { const u = new URL(h); return u.pathname + u.search; } catch { return h; } };

export function classifyFill(t: Target, o: PolicyOptions): PolicyDecision {
  if (!o.allowSensitiveFields && (t.type === 'password' || SENSITIVE_AUTOCOMPLETE.test(t.autocomplete) || SENSITIVE_FIELD.test(t.fieldName))) return deny('sensitive_field', `“${(t.fieldName || t.tag).slice(0, 60)}” looks like a password, card or identity field.`);
  return { allow: true };
}

/** The gate the flow engine calls before every step. Always applied; hosts can only loosen it through PolicyOptions. */
export function createPolicy(o: PolicyOptions) {
  return async function decide(step: Step, page: Page): Promise<PolicyDecision> {
    if (step.action === 'goto') return !o.allowCrossOrigin && origin(step.url) !== origin(o.startUrl) ? deny('cross_origin', `${new URL(step.url).host} is a different site from the flow's start page.`) : { allow: true };
    if (step.action === 'click') { const t = await inspect(page, step.selector); return t ? classifyClick(t, o) : { allow: true }; }   // a missing target fails normally in the runner
    if (step.action === 'fill') { const t = await inspect(page, step.selector); return t ? classifyFill(t, o) : { allow: true }; }
    if (step.action === 'press' && /^(enter|return)$/i.test(step.key) && !o.allowSubmit) {
      const inForm = await page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest?.('form')).catch(() => true);   // cannot tell: treat as in a form
      if (inForm) return deny('enter_in_form', 'pressing Enter inside a form can submit it.');
    }
    return { allow: true };
  };
}
