// The one example fix used on the landing page (hero card and "How it works"), so the two can never disagree.
export const EXAMPLE_PROMPT = 'Give the menu button a name that describes its action. Use “Open menu” while it’s closed and “Close menu” while it’s open. Preserve its appearance and keyboard behaviour.';

// Editor steps follow the vendors' own help pages:
//   Webflow: https://help.webflow.com/hc/en-us/articles/33961389460115 (Element settings > Custom attributes)
//   Framer:  https://www.framer.com/help/articles/improving-accessibility-with-aria-labels (Accessibility > ARIA label)
export const EXAMPLE_EDITORS: [string, string[]][] = [
  ['Webflow', ['Select the menu button.', 'Open Element settings, then Custom attributes.', 'Add aria-label with the value Open menu, then publish.']],
  ['Framer', ['Select the menu button layer.', 'In the Accessibility section, set ARIA label to Open menu.', 'Publish the site.']],
];
export const EXAMPLE_PATCH = `<button class="icon-btn" onClick={toggle} aria-label={open ? 'Close menu' : 'Open menu'}>
  <MenuIcon aria-hidden="true" />
</button>`;
