'use client';
// Which scan a report on screen belongs to, so a copied fix can be counted for that scan. Read-only views (shared links) provide nothing, and nothing is counted there.
import * as React from 'react';
const Ctx = React.createContext<string | null>(null);
export const ScanScope = Ctx.Provider;
export const useScanScope = () => React.useContext(Ctx);
