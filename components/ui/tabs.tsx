'use client';
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils.ts';
export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...p }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1', className)} {...p} />));
TabsList.displayName = 'TabsList';
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...p }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn('inline-flex items-center gap-1.5 min-h-11 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-700 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm', className)} {...p} />));
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(({ className, ...p }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-3 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-pine-700 rounded-lg', className)} {...p} />));
TabsContent.displayName = 'TabsContent';
