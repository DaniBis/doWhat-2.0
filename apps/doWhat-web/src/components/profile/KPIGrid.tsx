"use client";
import { KPI } from '@/types/profile';

export function KPIGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kpis.map(k => (
        <div key={k.label} className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{k.label}</div>
            <div className="text-2xl font-semibold text-gray-800 tabular-nums">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
