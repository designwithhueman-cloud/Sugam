// Deterministic three-mode fix recommendations: an AI-builder prompt, no-code inspector steps
// (Framer, Webflow) and a native-HTML-first code patch. "Before" is always the verbatim HTML
// extracted from the page; "after" changes only what the fix needs. Placeholders in [brackets]
// mark wording only the site owner can supply; Sugam never invents content.
import type { FixSet } from '../lib/db/schema.ts';

export type FixInput = {
  ruleId: string; title: string; whatToChange: string; wcagText: string; pageUrl: string;
  selector: string; html: string; instanceCount: number; detail?: string; data?: Record<string, unknown>;
};

// ---------- small HTML helpers (operate on the first start tag only) ----------
const START = /^<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/;
function addAttr(html: string, name: string, value: string): string {
  const m = html.match(START);
  if (!m) return html;
  const tag = m[0];
  const withoutOld = tag.replace(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i'), '');
  const insert = ` ${name}="${value.replace(/"/g, '&quot;')}"`;
  const next = withoutOld.replace(/\s*(\/?)>$/, `${insert}$1>`);
  return next + html.slice(tag.length);
}
function removeAttr(html: string, name: string): string {
  const m = html.match(START); if (!m) return html;
  const tag = m[0].replace(new RegExp(`\\s${name}(\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?`, 'i'), '');
  return tag + html.slice(m[0].length);
}
function renameTag(html: string, to: string): string {
  const m = html.match(START); if (!m) return html;
  const from = m[1];
  let out = `<${to}${m[2]}${m[3] ? ' /' : ''}>` + html.slice(m[0].length);
  out = out.replace(new RegExp(`</${from}>\\s*$`, 'i'), `</${to}>`);
  return out;
}
const attrOf = (html: string, name: string) => { const m = (html.match(START) || [''])[0].match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4]) : null; };
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

import { hexToRgb, lum, suggestForeground } from '../lib/contrast.ts';
import { plainTitle } from '../lib/plain.ts';
export { suggestForeground };

// ---------- per-rule recipes ----------
type Recipe = { change: string; after?: (h: string, i: FixInput) => string; language?: 'html' | 'css'; css?: (i: FixInput) => { before: string; after: string }; framer: string[]; webflow: string[]; note?: string };

const NAME_PH = '[Name the action, e.g. Open menu]';
const RECIPES: Record<string, Recipe> = {
  'image-alt': {
    change: 'Add an alt attribute that says what the image communicates. Use alt="" only if it is purely decorative.',
    after: (h) => addAttr(h, 'alt', '[Describe what this image shows]'),
    framer: ['Select the image layer.', 'In the right-hand properties panel find the image\'s alt text field (shown under the image fill or Accessibility settings, depending on your Framer version).', 'Describe what the image communicates, or mark it decorative if it adds no information.'],
    webflow: ['Select the image on the canvas.', 'Open the Settings panel (gear icon, or press D).', 'Under Alt text choose Custom description and describe what the image communicates, or choose Decorative if it adds no information.', 'If the image comes from a CMS field, set alt text in the Collection item instead.'],
  },
  'button-name': {
    change: 'Give the button a name that states its action: visible text, or an aria-label when it is icon-only.',
    after: (h) => addAttr(h, 'aria-label', NAME_PH),
    framer: ['Select the button or icon layer.', 'If your Framer version shows an accessibility label field for the element, enter the action (for example "Open menu").', 'Otherwise add a visually hidden text layer inside the button, or wrap it in a code component that renders a <button aria-label="…">.'],
    webflow: ['Select the button or link block.', 'Open the Settings panel (D) and scroll to Custom attributes.', 'Add name aria-label with a value that states the action (for example "Open menu").'],
  },
  'link-name': {
    change: 'Give the link a name that says where it goes: visible text, or an aria-label when it only contains an icon or image.',
    after: (h) => addAttr(h, 'aria-label', '[Where this link goes, e.g. Instagram]'),
    framer: ['Select the link layer.', 'Add visible text, or set the image\'s alt text to the destination, or use the accessibility label field if your Framer version has one.'],
    webflow: ['Select the link block.', 'Settings panel (D) → Custom attributes → add aria-label with the destination (for example "Instagram").'],
  },
  'label-content-name-mismatch': {
    change: 'Make the accessible name start with the visible text, so voice-control users can say what they see. Simplest: remove the aria-label.',
    after: (h) => removeAttr(h, 'aria-label'),
    framer: ['Select the link or button.', 'If an accessibility label is set, change it so it starts with the visible words (for example "Learn more about pricing"), or clear it.'],
    webflow: ['Select the element.', 'Settings panel (D) → Custom attributes.', 'Delete the aria-label attribute, or change its value so it starts with the visible text.'],
  },
  'aria-valid-attr-value': {
    change: 'Fix the ARIA attribute value so it is valid. For aria-controls / aria-labelledby, point it at an id that exists on the page.',
    framer: ['ARIA attributes are usually set in code components or embeds. Open the component and correct the attribute value.'],
    webflow: ['Select the element.', 'Settings panel (D) → Custom attributes.', 'Correct the attribute value, or point it at the id of an element that exists on the page.'],
  },
  'color-contrast': {
    change: 'Increase the contrast between the text and its background to at least 4.5:1 (3:1 for large text).',
    language: 'css',
    css: (i) => {
      const d = i.data || {};
      const fg = String(d.fgColor || ''), bg = String(d.bgColor || ''), need = Number(d.expectedContrastRatio ? String(d.expectedContrastRatio).replace(':1', '') : 4.5);
      const s = suggestForeground(fg, bg, need || 4.5);
      return {
        before: `${i.selector} {\n  color: ${fg || '[current colour]'}; /* ${d.contrastRatio ? `${d.contrastRatio}:1` : 'contrast below the minimum'} on ${bg || 'the background'} */\n}`,
        after: s ? `${i.selector} {\n  color: ${s.color}; /* ${s.ratio}:1 on ${bg}, meets ${need}:1 */\n}` : `${i.selector} {\n  color: [a colour with at least ${need || 4.5}:1 contrast on the background];\n}`,
      };
    },
    framer: ['Select the text layer.', 'In the Text section change the colour to one with at least 4.5:1 contrast against its background (the code tab shows a suggested value when Sugam could measure both colours).', 'If the text sits on an image or gradient, add a solid or semi-opaque backdrop behind the text.'],
    webflow: ['Select the text element (or its class).', 'Style panel → Typography → Color: choose a colour with at least 4.5:1 contrast against its background.', 'Update the class or colour variable so every instance changes.'],
  },
  'target-size': {
    change: 'Make the control at least 24×24 CSS pixels, or leave enough space around it.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} { /* smaller than 24×24px */ }`, after: `${i.selector} {\n  min-width: 24px;\n  min-height: 24px;\n}` }),
    framer: ['Select the control.', 'Set its width and height to at least 24px (44px is more comfortable on touch), or add padding.'],
    webflow: ['Select the control.', 'Style panel → Size: min width and min height 24px, or add padding.'],
  },
  'sugam/duplicate-cta-label': {
    change: 'Make each repeated call to action unique for assistive technology. Keep the visible text, and add an aria-label that starts with it and adds the context, e.g. "Get started with Pro".',
    after: (h) => addAttr(h, 'aria-label', `${textOf(h) || '[visible text]'} [with plan or product name]`),
    framer: ['Select each repeated button.', 'Set an accessibility label (or a visually hidden text layer) that starts with the visible text and adds the plan or product name, e.g. "Get started with Pro".'],
    webflow: ['Select each repeated button.', 'Settings panel (D) → Custom attributes → aria-label = visible text + context, e.g. "Get started with Pro".', 'In a CMS list, bind the extra words to the item\'s name field.'],
    note: 'Keep the visible words at the start of the aria-label so voice-control users can still say "click Get started" (WCAG 2.5.3).',
  },
  'sugam/focus-context-change': {
    change: 'Do not navigate, open a window or submit anything when an element only receives focus. Move that behaviour to a click (or Enter / Space) handler, or to a clearly labelled button.',
    framer: ['Check the element for an On Focus or hover-triggered link or interaction and replace it with an On Tap interaction.'],
    webflow: ['Check the element for interactions triggered by focus. Replace them with a click interaction or a normal link.'],
  },
  'sugam/non-text-contrast': {
    change: 'Give the field a border (or background) with at least 3:1 contrast against what is behind it, for example a 1px border of #767676 or darker on white.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} { border: 1px solid #d4d4d4; /* about 1.5:1 on white */ }`, after: `${i.selector} {\n  border: 1px solid #767676; /* at least 3:1 on white */\n}` }),
    framer: ['Select the input.', 'Set its border colour to something at least 3:1 against the page background (#767676 or darker on white).'],
    webflow: ['Select the field.', 'Style panel → Borders: set a 1px border using a colour with at least 3:1 contrast against the background.'],
  },
  'sugam/text-spacing': {
    change: 'Let the box grow with its text: replace a fixed height with min-height (or auto), and avoid overflow: hidden on text containers.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} { height: [fixed height]; overflow: hidden; }`, after: `${i.selector} {\n  height: auto;\n  min-height: [current height];\n  overflow: visible;\n}` }),
    framer: ['Select the frame around the text.', 'Set its height to Fit Content (or a minimum height) instead of Fixed, and turn off Clip content.'],
    webflow: ['Select the box around the text.', 'Style panel → Size: change Height to Auto (set a Min Height if needed) and set Overflow to Visible.'],
  },
  'sugam/dragging-alternative': {
    change: 'Add a single-click way to do whatever the drag does, such as "Move up" / "Move down" buttons, a number field or a menu, and keep the drag as an extra.',
    framer: ['Check what the drag does. Add buttons or a menu that do the same action with a click or tap.'],
    webflow: ['Check what the drag does. Add buttons or links that do the same action with a click.'],
  },
  'sugam/positive-tabindex': {
    change: 'Remove the positive tabindex and put the element in the right place in the page order instead. Use tabindex="0" only to make a custom control focusable.',
    after: (h) => h.replace(/\stabindex="[1-9]\d*"/, ''),
    framer: ['Remove any custom tab-index setting above 0 from the layer.'],
    webflow: ['Settings (D) → Custom attributes: delete the tabindex attribute, or set it to 0.'],
  },
  'sugam/auth-paste-blocked': {
    change: 'Delete the script that cancels paste (an onpaste handler, or a paste listener that calls preventDefault) on sign-in fields.',
    after: (h) => h.replace(/\sonpaste="[^"]*"/i, ''),
    framer: ['Look for a code override or component that blocks pasting and remove it from the sign-in form.'],
    webflow: ['Remove any custom code (Page settings → Custom code, or an Embed) that blocks paste on the sign-in fields.'],
  },
  'sugam/auth-autocomplete-off': {
    change: 'Use the autocomplete values browsers and password managers understand: "username" and "current-password" on sign-in, "new-password" on sign-up.',
    after: (h) => addAttr(h.replace(/\sautocomplete="[^"]*"/i, ''), 'autocomplete', /type="password"/i.test(h) ? 'current-password' : 'username'),
    framer: ['Select the field and set its Autocomplete / name attribute to username or current-password.'],
    webflow: ['Select the field → Settings (D) → Custom attributes: autocomplete = username (or current-password for the password field).'],
  },
  'sugam/auth-captcha': {
    change: 'Offer a sign-in route that needs no puzzle (a passkey, an email magic link or an invisible bot check), or use a challenge that does not need recognising images or characters.',
    framer: ['Use your sign-in provider\'s passkey or magic-link option, or switch to an invisible bot check.'],
    webflow: ['Use your membership or sign-in provider\'s passkey or magic-link option, or switch to an invisible bot check.'],
  },
  'sugam/image-of-text': {
    change: 'If the picture holds real words (a headline, a button label, a quote), rebuild it as live text styled to match. Keep an image only for logos and for text that cannot be live, and then put the same words in its alt text.',
    after: (h) => `<!-- Replace the image with live text -->\n<h2 class="[same look as the image]">${attrOf(h, 'alt') || '[the words in the image]'}</h2>`,
    framer: ['Delete the image layer and add a Text layer with the same words.', 'Match the font, size and colour in the properties panel.'],
    webflow: ['Replace the Image element with a Heading, Paragraph or Button element.', 'Copy the words from the image and style them in the Style panel.'],
    note: 'Sugam cannot read the pixels: check by eye that this image really contains text. Per W3C guidance, if the image has to stay, its alt text must contain exactly the words shown in it; logos are exempt and take the name alone as alt text.',
  },
  'sugam/form-autocomplete-missing': {
    change: 'Add the autocomplete value that matches the field, so browsers and password managers can fill it.',
    after: (h) => { const m = /\bemail|e-mail/i.test(h) ? 'email' : /phone|mobile|tel/i.test(h) ? 'tel' : /first|given/i.test(h) ? 'given-name' : /last|family|surname/i.test(h) ? 'family-name' : /zip|postal/i.test(h) ? 'postal-code' : /city|town/i.test(h) ? 'address-level2' : /street|address/i.test(h) ? 'street-address' : /type="password"/i.test(h) ? 'current-password' : 'name'; return addAttr(h, 'autocomplete', m); },
    framer: ['Select the input.', 'Set its Autocomplete (or name / type) property to the matching value, e.g. email, tel, given-name.'],
    webflow: ['Select the field → Settings (D) → Custom attributes: autocomplete = email (or tel, given-name, family-name, postal-code…).'],
  },
  'sugam/form-input-type': {
    change: 'Change the input type to email or tel so phones show the right keyboard and the browser can check the value.',
    after: (h) => h.replace(/\stype="text"/i, /e-?mail/i.test(h) ? ' type="email"' : ' type="tel"'),
    framer: ['Select the input and set its Type to Email or Phone.'],
    webflow: ['Select the field → Settings (D) → Input type: choose Email or Phone.'],
  },
  'sugam/form-required-not-marked': {
    change: 'Add the required attribute (it also gives built-in checking), and say near the top of the form what the star means.',
    after: (h) => addAttr(h, 'required', ''),
    framer: ['Select the input and turn on Required.'],
    webflow: ['Select the field and tick Required in its settings.'],
  },
  'sugam/form-error-not-linked': {
    change: 'Give the error text an id and point the field at it with aria-describedby, keeping aria-invalid="true" while the error shows.',
    after: (h) => addAttr(h, 'aria-describedby', '[id of the error text]'),
    framer: ['Link the error text layer to the field with an accessibility description, or use a code component that sets aria-describedby.'],
    webflow: ['Select the field → Settings (D) → Custom attributes: aria-describedby = the id of the error text element.'],
  },
  'sugam/form-label-not-visible': {
    change: 'Add a visible <label> next to or above the field and tie it with for / id. Use the same words as the current aria-label.',
    after: (h) => `<label for="[field-id]">${attrOf(h, 'aria-label') || attrOf(h, 'title') || '[Visible label]'}</label>\n${addAttr(h, 'id', '[field-id]')}`,
    framer: ['Add a Text layer above the field with the label words.', 'Keep the field\'s accessibility label identical to those words.'],
    webflow: ['Add a Label element above the field and set its For to the field, using the same words as the aria-label.'],
  },
  'sugam/form-group-name': {
    change: 'Wrap the related radio buttons or checkboxes in a <fieldset> and put the question in its <legend>.',
    after: () => '<fieldset>\n  <legend>[The question, e.g. How will you use Sugam?]</legend>\n  <label><input type="radio" name="[group]" value="a"> [Option A]</label>\n  <label><input type="radio" name="[group]" value="b"> [Option B]</label>\n</fieldset>',
    framer: ['Group the options in a stack and give the stack an accessibility role of group with a label holding the question.'],
    webflow: ['Use a Fieldset-style wrapper (Div Block with role="group" and aria-labelledby pointing at the question text), or the form block\'s native Radio Button Field group.'],
  },
  'sugam/small-text': {
    change: 'Raise the size to at least 14px (0.875rem), and use rem units so text grows when people change their browser text size.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} { font-size: 10px; }`, after: `${i.selector} {\n  font-size: 0.875rem; /* 14px, scales with browser settings */\n}` }),
    framer: ['Select the text layer.', 'Set the font size to 14px or larger.'],
    webflow: ['Select the text.', 'Style panel → Typography: set the size to 14px (or 0.875rem) or larger.'],
  },
  'sugam/autofocus': {
    change: 'Remove autofocus unless this field is inside a dialog the person just opened.',
    after: (h) => h.replace(/\sautofocus(="[^"]*")?/i, ''),
    framer: ['Remove any "autofocus" setting from the field or the code component.'],
    webflow: ['Settings (D) → Custom attributes: delete the autofocus attribute.'],
  },
  'sugam/new-tab-warning': {
    change: 'Say it in the link text, e.g. "Documentation (opens in a new tab)", and keep rel="noopener" on the link.',
    after: (h) => h.replace(/<\/a>\s*$/i, ' <span class="sr-only">(opens in a new tab)</span></a>'),
    framer: ['Edit the link text to add "(opens in a new tab)", or turn off "Open in new tab" if it is not needed.'],
    webflow: ['Edit the link text to add "(opens in a new tab)", or untick "Open in new tab" in the link settings.'],
    note: 'The sr-only class hides the words visually but keeps them for screen readers; in Tailwind it is already available.',
  },
  'sugam/heading-structure': {
    change: 'Use one h1 for the page title, then h2 for sections and h3 inside them, going down one level at a time. Pick the tag by structure, then style it to the size you want with CSS.',
    framer: ['Select the text layer and set its tag (H1 to H6) in the properties panel. One H1 per page; do not skip levels.'],
    webflow: ['Select the heading → Settings (D) → Tag: choose the level that matches the page outline. Keep the look with the Style panel.'],
  },
  'sugam/no-main-landmark': {
    change: 'Wrap the page content, everything except the header and footer, in a single <main> element.',
    after: () => '<header>…</header>\n<main>\n  …page content…\n</main>\n<footer>…</footer>',
    framer: ['Select the frame that holds the page content and set its tag to Main in the properties panel.'],
    webflow: ['Use the Main element (Add panel → Elements → Main) around the page content instead of a plain Div Block.'],
  },
  'sugam/vague-link-text': {
    change: 'Make the link text say where it goes. Keep the visible text and the accessible name the same.',
    after: (h) => h.replace(/>[^<]*<\/a>\s*$/i, '>[Say where it goes, e.g. Read the pricing guide]</a>'),
    framer: ['Select the link text and rewrite it to say its destination.'],
    webflow: ['Edit the link text to say where it goes. In a CMS list, bind the text to the item\'s title.'],
  },
  'sugam/placeholder-only-label': {
    change: 'Add a visible <label> tied to the field, and keep the placeholder only as an example of what to type.',
    after: (h) => `<label for="[field-id]">[Visible label, e.g. Email address]</label>\n${addAttr(h, 'id', '[field-id]')}`,
    framer: ['Add a text layer above the field with the label and, if available, set the field\'s Label / aria-label to the same words.'],
    webflow: ['Add a Label element above the field and set its For to the field (Settings → Name / ID).'],
  },
  'sugam/autoplay-no-pause': {
    change: 'Add the controls attribute, or a visible Pause button, or stop the video after a few seconds. Keep it muted and add playsinline for background loops.',
    after: (h) => addAttr(h, 'controls', ''),
    framer: ['Select the video and turn on Controls, or turn off Autoplay.'],
    webflow: ['Select the background video and use a visible pause control, or turn off Autoplay in its settings.'],
  },
  'sugam/voice-name-not-first': {
    change: 'Start the aria-label with exactly the words shown on the button, then add the extra context after them.',
    after: (h) => { const t = textOf(h); const lab = attrOf(h, 'aria-label'); return t && lab ? h.replace(/aria-label="[^"]*"/, `aria-label="${t} ${lab.replace(new RegExp(t, 'i'), '').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '')}"`.replace(/\s+"$/, '"')) : h; },
    framer: ['Edit the accessibility label so it begins with the visible words, e.g. "Learn more about pricing".'],
    webflow: ['Settings (D) → Custom attributes → aria-label: start with the visible text, then the extra words.'],
  },
  'sugam/forced-colors-optout': {
    change: 'Remove forced-color-adjust: none so the element follows the person\'s high-contrast colours. Keep it only on colour swatches and similar.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} { forced-color-adjust: none; }`, after: `${i.selector} {\n  /* forced-color-adjust removed */\n}` }),
    framer: ['Remove any code override or custom CSS setting forced-color-adjust: none.'],
    webflow: ['Remove forced-color-adjust: none from the element\'s custom CSS (Embed or Page settings).'],
  },
  'sugam/non-semantic-clickable': {
    change: 'Use a real <button type="button"> (or <a href> if it navigates). It is reachable with Tab and works with Enter and Space automatically.',
    after: (h) => { const nav = /location\.href|window\.location|navigate|router\.push/.test(h); return nav ? renameTag(removeAttr(h, 'onclick'), 'a').replace(/^<a/, `<a href="${(h.match(/location\.href\s*=\s*'([^']+)'/) || [])[1] || '[destination URL]'}"`) : addAttr(renameTag(h, 'button'), 'type', 'button'); },
    framer: ['Framer frames with a click interaction are not real buttons. Replace the frame with a Link (set its destination), or use a Framer button component.', 'For custom behaviour, use a code component that renders a <button>.'],
    webflow: ['Replace the Div Block that has a click interaction with a Link Block (set the URL) or a Button element.', 'Move the classes and children into the new element so the design is unchanged.'],
  },
  'sugam/looks-clickable': {
    change: 'This element shows a pointer cursor. If it does something when clicked, make it a <button> or <a href>. If it does nothing, remove cursor: pointer so it does not suggest an action.',
    framer: ['Check whether the frame has a click interaction. If yes, turn it into a Link or button component; if not, remove the pointer cursor.'],
    webflow: ['Check the element for interactions. If it is clickable, replace it with a Link Block; if not, remove cursor: pointer from its class.'],
  },
  'sugam/aria-tablist': {
    change: 'Follow the WAI-ARIA tabs pattern: one tab has aria-selected="true" and tabindex="0", the others tabindex="-1"; every tab has aria-controls pointing to an existing role="tabpanel"; Left/Right arrow keys move between tabs. If the "tabs" load separate pages, use links in a <nav> instead.',
    framer: ['Framer tab components built from variants need a code component to expose the tab roles and arrow-key behaviour. Use a code component that renders the pattern in the Code tab.'],
    webflow: ['Use Webflow\'s native Tabs element, which outputs the tab roles and keyboard support, instead of custom div tabs.', 'Give the Tabs Menu an aria-label in Settings → Custom attributes.'],
  },
  'sugam/reflow-320': {
    change: 'Let this element shrink to the screen width at 320 CSS pixels: replace fixed widths with max-width: 100% and let rows wrap.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} {\n  /* ${i.detail || 'wider than the 320px viewport'} */\n}`, after: `${i.selector} {\n  max-width: 100%;\n  box-sizing: border-box;\n  overflow-wrap: anywhere;\n  /* if this is a flex row: flex-wrap: wrap; */\n}` }),
    framer: ['Select the element and switch its width from Fixed to Fill (or Relative %), with a maximum width if needed.', 'Check the Phone breakpoint at 320px wide.'],
    webflow: ['Select the element on the Mobile Portrait breakpoint.', 'Style panel → Size: set Width to Auto or 100% and Max W to 100%.', 'For flex rows, set Wrap children.'],
  },
  'sugam/reduced-motion': {
    change: 'Stop or reduce this animation when the visitor has asked for reduced motion, and give looping animations a way to pause.',
    language: 'css',
    css: (i) => ({ before: `${i.selector} {\n  /* ${i.detail || 'animation keeps running'} */\n}`, after: `@media (prefers-reduced-motion: reduce) {\n  ${i.selector} {\n    animation: none;\n    transition: none;\n  }\n}` }),
    framer: ['Select the animated layer.', 'Remove the looping animation, or wrap it in a code override that checks useReducedMotion() and skips the animation.'],
    webflow: ['Open the interaction on this element.', 'Disable the loop, or add custom code in Page settings: @media (prefers-reduced-motion: reduce) { .your-class { animation: none; } }.'],
  },
  'sugam/media-transcript': {
    change: 'Put a transcript next to the player: a link or an expandable section with every spoken word and any important sounds. For video, also add a captions track.',
    after: (h) => `${h}\n<details>\n  <summary>Transcript</summary>\n  <p>[Full transcript: who speaks, what they say, and important sounds]</p>\n</details>`,
    framer: ['Add a Text layer or an accordion below the player titled "Transcript".', 'Paste the full transcript (most hosting services can export one).', 'For video, upload a captions file (.vtt) in the video component settings if available.'],
    webflow: ['Add a Rich Text block or Dropdown under the player titled "Transcript" and paste the transcript.', 'For a CMS collection, add a "Transcript" rich-text field and bind it here.', 'For video, add captions on the hosting service (YouTube, Vimeo) so the embed shows them.'],
    note: 'Auto-generated captions and transcripts need a human check for names, numbers and jargon.',
  },
  'sugam/embedded-media': {
    change: 'Turn on accurate captions at the hosting service (YouTube, Vimeo, Wistia, Loom), and add a transcript link next to the embed. For podcasts and other audio-only embeds, a transcript is required.',
    after: (h) => `${h}\n<p><a href="[transcript URL]">Read the transcript</a></p>`,
    framer: ['Upload or correct captions on the hosting service, then check they show in the embed.', 'Add a "Read the transcript" link or Text layer under the embed.'],
    webflow: ['Upload or correct captions on the hosting service, then check they show in the embed.', 'Add a Link or Rich Text block under the embed with the transcript.'],
    note: 'Players from other services run in their own frame, so a person needs to check captions by playing the media.',
  },
  'sugam/focus-not-visible': {
    change: 'Show a clear focus indicator when the element is reached with the keyboard. Do not remove the outline without replacing it.',
    language: 'css',
    css: (i) => ({ before: `${i.selector}:focus {\n  outline: none; /* no visible change when focused */\n}`, after: `${i.selector}:focus-visible {\n  outline: 3px solid #1a56db;\n  outline-offset: 2px;\n}` }),
    framer: ['Select the link or button and add a Focus variant (or focus state) with a visible outline or ring.', 'Check custom code for outline: none and remove it.'],
    webflow: ['Select the element\'s class and choose the Focused state in the Selector menu.', 'Add an outline or box shadow (e.g. 3px solid) with good contrast.', 'Remove any outline: none from the class.'],
  },
  'sugam/focus-obscured': {
    change: 'Keep focused elements from sliding under fixed or sticky content: reserve space with scroll-padding, or make the bar not cover content.',
    language: 'css',
    css: (i) => {
      const d = i.data || {}; const h = Math.ceil(Number(d.obscurerHeight) || 0); const bottom = d.obscurerEdge === 'bottom';
      return { before: `/* Focus lands under ${d.obscurer || 'a fixed element'} (position: ${d.position || 'fixed'}) */`, after: `html {\n  scroll-padding-${bottom ? 'bottom' : 'top'}: ${h ? h + 8 : '[height of the bar + 8]'}px;\n}` };
    },
    framer: ['Fixed headers and cookie banners can hide focused items. Reduce the bar height, make the banner dismissible early in the Tab order, or add scroll padding via custom code (code tab).'],
    webflow: ['Project settings → Custom code → Head: add the CSS from the code tab.', 'Make the cookie banner\'s Accept button the first thing reached by Tab, so it can be dismissed.'],
  },
  'sugam/focus-offscreen': {
    change: 'This element receives keyboard focus but is off-screen. Hide it from the Tab order when it is not shown, or make it visible when focused (like a skip link).',
    framer: ['Check hidden menus or drawers: when closed, they should be removed from the page or set to display: none.'],
    webflow: ['For closed menus and drawers, set Display: None on the closed state so their links are not in the Tab order.'],
  },
  'sugam/keyboard-trap': {
    change: 'Pressing Tab does not move focus away from this element. Make sure Tab and Shift+Tab always move on (modal dialogs must close with Escape).',
    framer: ['Check embedded widgets and code components on this element for keydown handlers that cancel Tab.'],
    webflow: ['Check embeds and third-party widgets on this element; remove or replace the one that traps Tab.'],
  },
};

const GENERIC: Recipe = {
  change: 'Follow the linked guidance for this rule; the evidence shows the exact element.',
  framer: ['Select the element shown in the screenshot.', 'Apply the change described in "What to change". Some fixes need a code component or code override in Framer.'],
  webflow: ['Select the element shown in the screenshot.', 'Apply the change described in "What to change"; ARIA attributes go in Settings (D) → Custom attributes.'],
};

const TABLIST_JSX = `<div role="tablist" aria-label="[Name of the tab set]">
  <button role="tab" id="tab-1" aria-selected="true" aria-controls="panel-1" tabIndex={0}>[Tab 1]</button>
  <button role="tab" id="tab-2" aria-selected="false" aria-controls="panel-2" tabIndex={-1}>[Tab 2]</button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1" tabIndex={0}>…</div>
<div role="tabpanel" id="panel-2" aria-labelledby="tab-2" tabIndex={0} hidden>…</div>
{/* onKeyDown on the tablist: ArrowRight/ArrowLeft move focus and selection, Home/End jump to first/last */}`;

const TOOLS: Record<'lovable' | 'bolt' | 'v0' | 'cursor', string> = {
  lovable: 'In Lovable chat, paste:',
  bolt: 'In Bolt.new, paste into the prompt box:',
  v0: 'In v0, paste into the chat for this project:',
  cursor: 'In Cursor (Agent or Cmd+K), paste. The markup may be generated by a component, so search the codebase for it first:',
};


// Contrast fixes get their own, shorter prompt: the existing palette first, a stated target, a verified hex only as a
// fallback, and a scoped, verified change. Nothing here is invented: the colours and ratio are axe's measurements.
function contrastBody(i: FixInput): string {
  const d = i.data || {};
  const fg = String(d.fgColor || ''), bg = String(d.bgColor || '');
  const need = Number(String(d.expectedContrastRatio || '4.5').replace(':1', '')) || 4.5;
  const large = need <= 3;
  const text = textOf(i.html).slice(0, 60);
  const measured = fg && bg && d.contrastRatio ? `${fg} on ${bg} is ${d.contrastRatio}:1` : 'the contrast is below the minimum';
  const size = d.fontSize ? ` (${String(d.fontSize).replace(/\s+/g, ' ')}${d.fontWeight ? `, weight ${d.fontWeight}` : ''})` : '';
  const sug = fg && bg ? suggestForeground(fg, bg, need) : null;
  const bgRgb = hexToRgb(bg); const dir = bgRgb && lum(bgRgb) > 0.5 ? 'darker' : 'lighter';
  const snippet = i.html.length > 240 ? i.html.slice(0, 240) + '…' : i.html;
  return [
    `Fix low text contrast (${i.wcagText}) on ${i.pageUrl}. Change only this element: ${i.selector}${text ? `, the text "${text}"` : ''}.`,
    '```html', snippet, '```',
    `Measured: ${measured}${size}. Target: ${need}:1 (${large ? 'large text' : 'normal text'}).`,
    'Goal: pass contrast without changing the design system or the look of the site. Do not touch the background, font size or weight, and do not add colours that are not already in the palette unless step 3 forces it.',
    '1. Use the existing palette first. Pick the design system\'s text colour token for this context. If several tokens pass, take the closest shade in the same colour family, so the change is as small as possible.',
    '2. If the text gets smaller at a supported breakpoint, pick a token that passes at both sizes.',
    sug ? `3. Only if no token passes, use ${sug.color} (${sug.ratio}:1 on ${bg}). It is the current colour made ${dir} by the least amount that passes. Look in the project\'s palette for a match first, and if you must add it, add it as a named token rather than an inline value.` : `3. If no token passes, choose the closest shade of the current colour that reaches ${need}:1 against the real background${bg ? ` (${bg})` : ' (the background could not be measured, so check it in the browser)'}, and add it as a named token rather than an inline value.`,
    '4. Change only this element and keep its other styles. Leave shared colour utilities and tokens unchanged. Check the rendered contrast at desktop and mobile widths.',
    '5. Tell me which token or value you used, so the design owner can review it.',
    i.instanceCount > 1 ? `This appears ${i.instanceCount} times: fix the shared component or class, not just one copy.` : '',
  ].filter(Boolean).join('\n');
}

// Shorter prompts cost the builder fewer tokens and are easier to follow: the markup is collapsed (inline SVG paths and long
// runs of whitespace add nothing), very long selectors keep only their last segments, and some rules lead with what actually
// matters (for covered focus, the fixed element that covers it, not the focused button).
function compactHtml(html: string, max = 320): string {
  const h = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg>…</svg>').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  return h.length > max ? h.slice(0, max) + '…' : h;
}
function shortSelector(sel: string): string {
  const parts = sel.split(/\s>\s/);
  return parts.length > 4 ? '… > ' + parts.slice(-3).join(' > ') : sel;
}

// How a person confirms the fix worked, by rule. Anything not listed falls back to a rescan.
const VERIFY: Record<string, string> = {
  'image-alt': 'every image has alt text that says what it shows, or alt="" if it is only decoration.',
  'button-name': 'a screen reader announces a clear name for the button.',
  'link-name': 'a screen reader announces where the link goes.',
  'input-button-name': 'a screen reader announces a clear name for the button.',
  label: 'the field has a visible label, and clicking the label focuses the field.',
  'aria-valid-attr-value': 'the attribute points to an element that exists on the page.',
  'sugam/focus-obscured': 'press Tab to reach it; the focused item is fully visible and not covered by the bar.',
  'sugam/non-semantic-clickable': 'press Tab to reach it, then Enter or Space; it works like a real button.',
  'sugam/duplicate-cta-label': 'each link or button has a name that says where it goes.',
};

export function buildFixes(i: FixInput): FixSet {
  const r = RECIPES[i.ruleId] || GENERIC;
  let code: FixSet['code'];
  if (i.ruleId === 'sugam/aria-tablist') code = { language: 'jsx', before: i.html, after: TABLIST_JSX, note: 'Native-HTML-first: if each tab opens a different page, use <nav><a href> links with aria-current="page" instead of ARIA tabs.' };
  else if (r.css) { const c = r.css(i); code = { language: 'css', before: c.before, after: c.after, note: r.note }; }
  else if (r.after) code = { language: 'html', before: i.html, after: r.after(i.html, i), note: r.note ?? 'Text in [brackets] is wording only you can supply. In JSX, write className and htmlFor instead of class and for.' };
  else code = { language: 'html', before: i.html, after: '', note: 'No automatic patch for this rule. Follow "What to change" and the linked guidance.' };

  const label = textOf(i.html).slice(0, 40);
  const cover = i.ruleId === 'sugam/focus-obscured' ? (i.detail || '').match(/covered by (.+?) \(position: (fixed|sticky)\)/) : null;
  const wcag = i.wcagText.match(/WCAG [\d.]+/)?.[0];
  const target = code.after && code.after.length <= 280 ? `Target:\n\`\`\`${code.language}\n${code.after}\n\`\`\`` : '';
  // Short on purpose: the element, what to change, and how to check it worked. The evidence (full selectors, measurements, the long
  // code) stays in the report's Technical details, so the builder is not paid to read it on every prompt.
  const body = i.ruleId === 'color-contrast' ? contrastBody(i) : [
    `Fix: ${plainTitle(i.ruleId, i.title)}${wcag ? ` (${wcag})` : ''}.`,
    `Element: ${label ? `\u201c${label}\u201d, ` : ''}${shortSelector(i.selector)}${i.instanceCount > 1 ? ` (and ${i.instanceCount - 1} more like it)` : ''}`,
    cover ? `Covered by: ${cover[1]} (${cover[2]}).` : target ? '' : ['```html', compactHtml(i.html, 220), '```'].join('\n'),
    `Change: ${r.change}`,
    target ? target.replace('Target:', 'Make the element look like this:') : '',
    `Verify: ${VERIFY[i.ruleId] || 'scan the page again with Sugam; this issue should be gone.'}`,
    `Keep the visual design unchanged.${i.instanceCount > 1 ? ' Fix the shared component or style so every instance is covered.' : ''}`,
  ].filter(Boolean).join('\n');
  const aiPrompt = Object.fromEntries(Object.entries(TOOLS).map(([k, pre]) => [k, `${pre}\n\n${body}`])) as FixSet['aiPrompt'];
  return { aiPrompt, noCode: { framer: r.framer, webflow: r.webflow }, code };
}
export { attrOf, textOf };
