'use client';
// The fix for one recommendation, in the builder's own tool: four AI-builder prompts, Framer and Webflow steps, and a code patch.
// Each is short (the element, the smallest change, how to check it). One Copy button per tab.
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import type { AvaraFix } from '@/lib/report-types.ts';
import { bulletLines } from '@/lib/bullets.ts';
import { splitFix, promptOnly } from '@/lib/fix-text.ts';
import { FixPanel } from './FixPanel.tsx';

const NAMES: Record<string, string> = { lovable: 'Lovable', bolt: 'Bolt', v0: 'v0', cursor: 'Cursor', framer: 'Framer', webflow: 'Webflow', code: 'Code' };
const bare = (p: string) => (p.includes('\n\n') ? p.slice(p.indexOf('\n\n') + 2) : p);
const wrap = '[overflow-wrap:anywhere]';

/** Every tool, one view: the same fix panel the report uses (components/report/FixPanel.tsx). */
export function AvaraFixTabs({ fixes, id }: { fixes: AvaraFix[]; id: string }) {
  return <FixPanel fixes={fixes} id={id} />;
}
