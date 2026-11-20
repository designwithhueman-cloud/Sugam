'use client';
// Optional category filter for the list of other fixes. Rows are rendered on the server; this only shows or hides them.
import * as React from 'react';

export function FilterList({ categories, rows, label }: { categories: string[]; rows: { id: string; categories: string[]; node: React.ReactNode }[]; label: string }) {
  const [cat, setCat] = React.useState<string | null>(null);
  const shown = rows.filter((r) => !cat || r.categories.includes(cat));
  return (
    <div>
      {categories.length > 1 && (
        <div role="group" aria-label={`Filter ${label} by category`} className="mb-4 flex flex-wrap gap-2">
          {[null, ...categories].map((c) => (
            <button key={c ?? 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
              className={`min-h-11 rounded-full border px-4 text-base font-medium ${cat === c ? 'border-ink bg-ink text-white' : 'border-black/25 bg-white text-ink hover:bg-black/5'}`}>{c ?? 'All'}</button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-black/10 border-y border-black/10">{shown.map((r) => <li key={r.id}>{r.node}</li>)}</ul>
      {shown.length === 0 && <p className="py-4 text-base text-neutral-700">Nothing in this category.</p>}
    </div>
  );
}
