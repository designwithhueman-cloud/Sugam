// Links in the header and the footer's Product column. Every anchor is a section on the landing page.
import { SHOW_AGENCIES, SHOW_WHO } from './flags.ts';

export type NavLinks = [string, string][];
export const NAV: NavLinks = ([['How it works', '/#how'], ['What we check', '/#pillars'], ['Who it’s for', '/#who'], ['For agencies', '/#agencies'], ['Pricing', '/#pricing']] as NavLinks).filter(([, h]) => (SHOW_AGENCIES || h !== '/#agencies') && (SHOW_WHO || h !== '/#who'));
