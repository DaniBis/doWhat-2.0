"use client";
import { Badge } from '@/types/profile';

const statusColors: Record<string,string> = {
  verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  unverified: 'bg-gray-100 text-gray-600 border-gray-200',
  expired: 'bg-red-100 text-red-600 border-red-200'
};

export function BadgesPreview({ badges }: { badges: Badge[] }) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center justify-between">Recent Badges
        <span className="text-xs text-gray-500 font-normal">{badges.length}</span>
      </h3>
      {badges.length === 0 && <div className="text-sm text-gray-500">No badges yet.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {badges.slice(0,4).map(b => (
          <div key={b.id} className="rounded-lg border p-3 flex flex-col gap-1 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm truncate">{b.name}</div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColors[b.status] || statusColors.unverified}`}>{b.status}</span>
            </div>
            <div className="text-xs text-gray-600 flex items-center gap-2">
              {b.level && <span className="font-mono bg-white/70 px-1 rounded border border-gray-200">L{b.level}</span>}
              {b.earnedAt && <span>{new Date(b.earnedAt).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
