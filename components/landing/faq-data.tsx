import * as React from 'react';
import Link from 'next/link';
import { CreditCard, GitCompare, Gift, Lock, Share2, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';

// Shared by both landing versions, so the answers cannot drift apart.
export const FAQ: [string, React.ReactNode][] = [
  ['What do I get from a free scan?', 'One public page per scan, checked at desktop and 320px mobile widths. With no account you get the number of issues found, severity counts, your top three issue types and one finding opened in full, with its first three elements and its fix. A free account also lists every issue type and who it may affect; exact elements, screenshots and the other fixes need a paid plan. You can start 5 scans per 10 minutes without an account and 20 with one.'],
  ['Can Avara check a page behind a login?', 'No. Avara scans one public page per scan and cannot sign in, so pages behind a login, paywall or firewall cannot be checked. It also refuses private and internal addresses. To check a signed-in page, scan a public version of it.'],
  ['Do I need to know how to code?', 'No, for most fixes. Each finding comes with a prompt to paste into your AI builder and, for Webflow and Framer, step-by-step editor instructions. A developer may need to help when your editor has no field for the change; give them the code patch. Avara adds nothing to your site, so a fix stays if you stop using Avara.'],
  ['Can I share the report with a client?', <>Agency Pro creates read-only report links that anyone holding the link can open for 90 days, and they can carry your brand name and colours. Paid plans also export CSV and SARIF files. Scan results and screenshots are stored until deleted on request: see the <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">privacy page</Link> for what is kept.</>],
  ['How is this different from Lighthouse, WAVE or axe?', 'Avara runs axe-core, the same open-source engine behind several of those tools, in a real browser at desktop and mobile widths, and adds a Tab-key trace. What it adds on top is the part after the scan: findings sorted by who they affect, in plain language, with a fix written as a prompt for your AI builder, editor steps or a code patch, and a retest to see whether the fix worked. If you are comfortable reading raw axe output, a free checker may be all you need.'],
  ['Does a clean scan certify compliance?', 'No. The report records the automated checks completed on the pages tested. Some accessibility requirements need manual evaluation.'],
  ['What is the launch check?', 'It looks for four mistakes that AI-built apps sometimes ship with: secret keys in the page’s code, private files like .env left public, public source code, and database tables a signed-out visitor can read. Each problem comes with a message to paste into your builder, and checking again shows what was fixed, what is still open and what newly broke.'],
  ['Is it safe to run the launch check on my site?', 'Yes. It only reads: it never changes your site, never signs in, and never keeps a full copy of your keys or any customer records. Reading your code for leaked keys works on any public page. The extra checks, for private files, source code and database tables, run only after you prove the site is yours by adding one line to it.'],
  ['What happens when I request a paid plan?', 'Checkout is not open, so requesting access only adds your email to the waiting list for that plan. Nothing is charged, and we email you once when it opens. Planned prices, which may change, are $19 per site per month for Creator / Startup and $149 per month for Agency Pro.'],
];

export const section = 'scroll-mt-6 px-5 pb-20 sm:px-10 lg:pb-32';

// One icon per question, in the same order as FAQ.
export const FAQ_ICONS: LucideIcon[] = [Gift, Lock, Wand2, Share2, GitCompare, ShieldCheck, ShieldCheck, Lock, CreditCard];
