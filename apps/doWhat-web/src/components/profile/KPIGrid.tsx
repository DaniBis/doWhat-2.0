"use client";
import { KPI } from '@/types/profile';

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="grid gap-md sm:grid-cols-3">
      {kpis.map(k => (
        <div key={k.label} className="rounded-xl bg-surface border border-midnight-border/40 p-md shadow-sm">
          <div className="text-xs uppercase tracking-wide text-ink-muted mb-xxs">{k.label}</div>
            <div className="text-2xl font-semibold text-ink-strong tabular-nums">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
