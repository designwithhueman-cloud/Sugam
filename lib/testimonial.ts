// The one customer quote on the landing page. Leave it null until a real customer has approved the exact wording. Even when
// it is filled in, `approved` must be true (set it only after the person has said yes in writing to this wording and to being
// named): the section does not render without it, and nothing here may be invented, paraphrased or attributed without their yes.
// `highlight` is a phrase inside `quote` that is picked out in colour. `rating` (1 to 5) shows stars only if the customer
// actually gave one. `builder` is the AI builder or tool they used, `href` links to their finding and retest.
export type Testimonial = { quote: string; highlight: string; name: string; role: string; company: string; builder?: string; href?: string; rating?: number; photo?: string; approved: boolean };

// Live. Avinash approved this exact wording and being named (confirmed by the site owner, 16 Nov 2026). The claims in it, that he does
// not code and fixed it himself, are his. If the wording changes, get a new yes first.
// 21 Nov 2026: the product name in the quote was changed from Sugam to Avara after the rename, at the site owner's request.
// Nothing else in his wording changed.
export const TESTIMONIAL: Testimonial | null = {
  quote: 'Our \u2018Book a Call\u2019 button kept getting hidden behind a bar on the page. Avara gave me a prompt I could paste into my AI builder. I don\u2019t code, and I fixed it myself.',
  highlight: 'I don\u2019t code, and I fixed it myself',
  name: 'Avinash',
  role: 'Co-founder',
  company: 'Design with Hueman',
  approved: true,
};
