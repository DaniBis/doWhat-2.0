"use client";
import { Trait } from '@/types/profile';

export function TraitsPreview({ traits }: { traits: Trait[] }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm flex flex-col">
      <h3 className="font-semibold text-gray-800 mb-3">Top Traits</h3>
      {traits.length === 0 && <div className="text-sm text-gray-500">No traits yet.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {traits.map(t => (
          <div key={t.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{t.name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="tabular-nums">{Math.round(t.score)}</span>
                <ConfidenceDot c={t.confidence} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceDot({ c }: { c: number }) {
  const color = c >= 0.75 ? 'bg-emerald-500' : c >= 0.5 ? 'bg-amber-500' : 'bg-gray-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`Confidence ${(c*100).toFixed(0)}%`} />;
}
