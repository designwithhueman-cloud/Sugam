import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-slate-100 text-slate-700',
      critical: 'bg-red-100 text-red-800', serious: 'bg-orange-100 text-orange-800', moderate: 'bg-amber-100 text-amber-900', minor: 'bg-sky-100 text-sky-800',
      design: 'bg-pink-100 text-pink-800', no_code: 'bg-pine-100 text-pine-800', dev: 'bg-emerald-100 text-emerald-800',
      outline: 'border border-slate-300 text-slate-700', ai: 'bg-pine-100 text-pine-800',
    },
  },
  defaultVariants: { variant: 'default' },
});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
