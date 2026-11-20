// The free "accessibility rules for your AI builder" file. Short on purpose (it is read on every prompt, so every line costs
// tokens), each line maps to a WCAG 2.2 AA requirement that AI-built sites commonly miss, and nothing in it asks the builder to
// change a design system or add an overlay.
export const AI_RULES = `Accessibility rules for this project (WCAG 2.2 AA)
- Use native elements first: <button> for actions, <a href> for navigation, <label> for fields. Never make a <div> or <span> clickable.
- Every image has alt text that says what it shows. Decorative images get alt="".
- Every icon-only button has an accessible name, such as aria-label="Open menu".
- Every form field has a visible label linked with htmlFor and id. A placeholder is not a label.
- Text contrast is at least 4.5:1 (3:1 for large text and for borders of controls). Use the existing colour tokens. Do not invent new colours.
- Everything interactive works with the keyboard and shows a visible focus ring. Never remove an outline without a replacement.
- One <h1> per page, headings in order with no skipped levels. Use <main>, <nav>, <header> and <footer>.
- Do not put headings, buttons or other text inside images.
- Respect prefers-reduced-motion. Anything that moves for more than 5 seconds needs a way to pause it.
- Touch targets are at least 24x24 CSS pixels. The page works at 320px wide with no sideways scrolling.
- Video has captions. Audio has a transcript.
- Set lang on <html> and give each page its own <title>.
- Do not add an accessibility overlay or widget.
When you change a component, say which of these rules it touches.`;
