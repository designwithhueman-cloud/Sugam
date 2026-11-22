// The one example fix used on the landing page: the bookings banner that covers "Book a call" on a phone. The hero demo
// shows the problem, How it works shows these three ways to fix it and the phone after the rescan, so they can never disagree.
export const EXAMPLE_PROMPT = 'On phones, the “Bookings open” banner is fixed to the bottom of the screen and covers the “Book a call” button. Move the banner to the top of the page, above the main content, so it scrolls with the page instead of staying fixed. Keep its text and colours, and don’t change the Book a call button.';

// Editor steps use each editor's own Position setting (Webflow: Style panel > Position; Framer: Position in the layer's settings).
export const EXAMPLE_EDITORS: [string, string[]][] = [
  ['Webflow', ['Select the Bookings open banner.', 'In the Style panel, set Position from Fixed to Static.', 'In the Navigator, drag the banner above the main content, then publish.']],
  ['Framer', ['Select the Bookings open banner.', 'In Position, change Fixed to Relative.', 'In Layers, move the banner to the top of the page, then publish.']],
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
