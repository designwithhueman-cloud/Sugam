// Short guides for people building with AI tools. Plain language, one idea per section, no statistics and no legal advice.
export type Guide = { slug: string; title: string; summary: string; intro: string; sections: { h: string; p?: string[]; list?: string[] }[] };

export const GUIDES: Guide[] = [
  { slug: 'wcag-in-plain-language', title: 'WCAG in plain language', summary: 'What the standard is, what the levels mean, and which one to aim for.',
    intro: 'WCAG, the Web Content Accessibility Guidelines, is the shared checklist for making websites usable by more people. You do not need to read all of it. You need to know what it asks for and which level to aim for.',
    sections: [
      { h: 'The four ideas behind it', list: ['Perceivable: people can see, hear or otherwise take in the content, so images have alt text and text has enough contrast.', 'Operable: people can use every control, with a keyboard if they cannot use a mouse.', 'Understandable: labels, errors and navigation make sense and behave the same way each time.', 'Robust: the code is clean enough for browsers and assistive tools, such as screen readers, to read it.'] },
      { h: 'Levels A, AA and AAA', p: ['Level A is the minimum, AA is what most teams aim for, and AAA is the strictest and is not expected for a whole site. When a law or a client says “WCAG compliant”, they almost always mean AA.'] },
      { h: 'Versions', p: ['WCAG 2.2 is the newest. Earlier versions, 2.0 and 2.1, are still named in some rules, so check which version applies to you. Passing 2.2 AA covers nearly everything in 2.1 AA.'] },
      { h: 'Where laws come in', p: ['Rules such as ADA Title II in the United States, the European Accessibility Act in the EU and the AODA in Ontario point to WCAG at level AA, with different versions. This guide is not legal advice. Ask a lawyer what applies to your business.'] },
      { h: 'What a scan can and cannot tell you', p: ['An automated scan catches many problems, such as missing alt text, low contrast and controls with no name. It cannot judge whether alt text is accurate, whether the reading order makes sense or whether a task is easy to finish. A clean scan is a good sign, not a certificate.'] },
    ] },
  { slug: 'accessibility-in-ai-built-sites', title: 'Accessibility in sites built with AI tools', summary: 'The problems AI builders often leave behind, and how to ask for better.',
    intro: 'AI builders produce pages that look finished quickly. Looking finished and working for everyone are different things, and the gaps tend to be the same ones.',
    sections: [
      { h: 'What goes wrong most often', list: ['Clickable boxes: a <div> with a click handler instead of a <button>, so a keyboard cannot reach it.', 'Icon buttons with no name, so a screen reader says only “button”.', 'Soft grey text on a white background that looks tasteful and is hard to read.', 'Images with no alt text, or alt text that just repeats a file name.', 'Form fields with a placeholder but no real label.', 'Animations that keep moving and ignore the “reduce motion” setting.'] },
      { h: 'How to ask for better', p: ['Put your accessibility rules where your tool keeps standing instructions, so every prompt follows them. Avara publishes a short rules file you can copy for free.'] },
      { h: 'Check what you got', p: ['Press Tab through the page and see where focus goes. Zoom to 200%. Then scan the page and fix the findings one at a time, using the prompt written for each one.'] },
    ] },
  { slug: 'fix-low-contrast', title: 'Fixing low-contrast text', summary: 'The two numbers to remember, and how to fix a colour without changing your brand.',
    intro: 'Contrast is the difference in brightness between text and its background. It is the most common problem on the web and one of the easiest to fix.',
    sections: [
      { h: 'The two numbers', list: ['4.5 to 1 for normal text.', '3 to 1 for large text (about 24px, or 19px bold) and for the borders of buttons and fields.'] },
      { h: 'Fix it inside your design system', p: ['Look for a darker (or lighter) token in the same colour family that already passes. If none does, nudge the current colour just far enough to pass, and add it to your palette as a named token so it stays consistent.'] },
      { h: 'Things that need a person', p: ['Text over a photo or gradient cannot be measured with one number, because the background changes behind it. Add a solid or semi-transparent layer behind the text, or check the worst spot by eye.'] },
    ] },
  { slug: 'keyboard-and-focus', title: 'Keyboard use and focus', summary: 'A two-minute test anyone can run, and what to fix when it fails.',
    intro: 'Some people never use a mouse. They move with the Tab key and press Enter or Space. If your page does not work that way, they cannot use it.',
    sections: [
      { h: 'The two-minute test', list: ['Click the address bar, then press Tab repeatedly.', 'You should always see where you are. A ring or outline should move from control to control.', 'Every link, button and field should be reachable, in an order that follows the page.', 'You should never get stuck. Escape should close dialogs.'] },
      { h: 'Common fixes', list: ['Use a real <button> or <a href> instead of a clickable <div>.', 'Keep the focus ring. If you restyle it, make it clear.', 'Do not let a sticky header or cookie banner cover the focused item.', 'Hide closed menus from the Tab order.'] },
    ] },
  { slug: 'write-good-alt-text', title: 'Writing good alt text', summary: 'When to describe an image, when to leave it empty, and what to write.',
    intro: 'Alt text is the written version of an image, read aloud by screen readers and shown when an image does not load.',
    sections: [
      { h: 'Say what the image is for', p: ['Describe what the image communicates in this place, not every detail. A photo of a team on a careers page might say “The design team at a planning session”. The same photo beside a story about one person might need a different line.'] },
      { h: 'When to leave it empty', p: ['If an image is only decoration, use alt="" so screen readers skip it. Leaving the attribute off is not the same: some tools then read out the file name.'] },
      { h: 'Skip the filler', list: ['No “image of” or “picture of”.', 'No file names such as IMG_1234.', 'For an icon button, name the action (“Open menu”), not the icon.', 'If a logo links home, the alt text can say where it goes.'] },
    ] },
];
export const guideBySlug = (s: string) => GUIDES.find((g) => g.slug === s);
