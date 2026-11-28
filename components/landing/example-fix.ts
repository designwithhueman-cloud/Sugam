// The one example fix used on the landing page: the bookings banner that covers "Book a call" on a phone. The hero demo
// shows the problem, How it works shows these three ways to fix it and the phone after the rescan, so they can never disagree.
export const EXAMPLE_PROMPT = 'On phones, the “Bookings open” banner is fixed to the bottom of the screen and covers the “Book a call” button. Move the banner to the top of the page, above the main content, so it scrolls with the page instead of staying fixed. Keep its text and colours, and don’t change the Book a call button.';

// Editor steps use each editor's own setting, the value, and how to preview (Shopify: a section's Custom CSS; Webflow: Style panel >
// Position; Framer: Position in the layer's settings). One editor is shown at a time.
export const EXAMPLE_EDITORS: [string, string[]][] = [
  ['Webflow', ['Select the Bookings open banner.', 'In the Style panel, set Position from Fixed to Static.', 'In the Navigator, drag the banner above the main content.', 'Preview at phone width: Book a call is no longer covered. Then publish.']],
  ['Framer', ['Select the Bookings open banner.', 'In Position, change Fixed to Relative.', 'In Layers, move the banner to the top of the page.', 'Preview at phone width: Book a call is no longer covered. Then publish.']],
  ['Shopify', ['In Online Store, open Themes and click Customize.', 'Select the section with the Bookings open banner.', 'In its Custom CSS, add: .bookings-banner { position: static; }', 'Switch the preview to mobile: Book a call is no longer covered. Then save.']],
];
// Where the same CSS goes in each framework.
export const EXAMPLE_FRAMEWORKS: [string, string][] = [
  ['Next.js', 'app/globals.css'], ['React', 'src/index.css'], ['Astro', '<style is:global> in the layout'], ['Vue', 'the component’s <style> block'], ['Svelte', 'the component’s <style>, as :global(.bookings-banner)'],
];
// The patch as lines: ' ' unchanged, '-' removed, '+' added.
export const EXAMPLE_PATCH_LINES: [' ' | '-' | '+', string][] = [
  [' ', '/* Move <div class="bookings-banner"> to the top of <main>, then: */'],
  [' ', '.bookings-banner {'],
  ['-', '  position: fixed;'],
  ['-', '  bottom: 0;'],
  ['+', '  position: static;'],
  [' ', '}'],
];
export const EXAMPLE_PATCH = EXAMPLE_PATCH_LINES.map(([k, t]) => (k === ' ' ? '  ' : `${k} `) + t).join('\n');
