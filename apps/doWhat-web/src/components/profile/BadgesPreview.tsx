"use client";
import { Badge } from '@/types/profile';

const statusColors: Record<string,string> = {
  verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  unverified: 'bg-surface-alt text-ink-medium border-midnight-border/40',
  expired: 'bg-red-100 text-red-600 border-red-200'
};

export function BadgesPreview({ badges }: { badges: Badge[] }) {
  return (
    <div className="rounded-xl bg-surface border border-midnight-border/40 p-lg shadow-sm">
      <h3 className="font-semibold text-ink-strong mb-sm flex items-center justify-between">Recent Badges
        <span className="text-xs text-ink-muted font-normal">{badges.length}</span>
      </h3>
      {badges.length === 0 && <div className="text-sm text-ink-muted">No badges yet.</div>}
      <div className="grid gap-sm sm:grid-cols-2">
        {badges.slice(0,4).map(b => (
          <div key={b.id} className="rounded-lg border p-sm flex flex-col gap-xxs bg-surface-alt">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm truncate">{b.name}</div>
              <span className={`text-[10px] px-xs py-hairline rounded-full border ${statusColors[b.status] || statusColors.unverified}`}>{b.status}</span>
            </div>
            <div className="text-xs text-ink-medium flex items-center gap-xs">
              {b.level && <span className="font-mono bg-surface/70 px-xxs rounded border border-midnight-border/40">L{b.level}</span>}
              {b.earnedAt && <span>{new Date(b.earnedAt).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
