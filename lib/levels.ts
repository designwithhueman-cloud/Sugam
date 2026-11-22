// The report's levels (label, chip colours, pin colour), shared by the report board (a client component) and server pages such as the project overview.
import type { Level } from './review-view.ts';

export const LEVELS: Record<Level, { label: string; chip: string; pin: string }> = {
  critical: { label: 'Critical', chip: 'bg-[#fde7e1] text-[#7a1f0b]', pin: '#c2200c' },
  high: { label: 'Before launch', chip: 'bg-[#ffecc7] text-[#6b3b00]', pin: '#c26a00' },
  medium: { label: 'Improve', chip: 'bg-[#e8f0ff] text-[#1c3f8a]', pin: '#2f5fd0' },
  review: { label: 'Worth a look', chip: 'bg-[#efe9ff] text-[#432099]', pin: '#6d4fd6' },
};
