"use client";

import { Badge, BadgeStatus, BADGE_CATEGORIES, BadgeCategory, BADGE_VERIFICATION_THRESHOLD_DEFAULT } from "@dowhat/shared";

type Item = {
  id?: string; // undefined for unearned
  badge_id: string;
  status: BadgeStatus;
  source?: string | null; // allow null from DB
  endorsements?: number;
  badges?: Partial<Badge> | null;
  locked?: boolean; // derived for catalog display
};

export default function BadgesGrid({ items, threshold = BADGE_VERIFICATION_THRESHOLD_DEFAULT }: { items: Item[]; threshold?: number }) {
  const groups = groupByCategory(items);
  const cats = Object.keys(groups) as BadgeCategory[];

  if (!cats.length) {
    return (
      <div className="text-center py-xxl text-ink-muted">
        <div className="text-4xl mb-xs">🏆</div>
        <p>No badges yet. Participate and get endorsed to earn badges!</p>
      </div>
    );
  }

  return (
    <div className="space-y-xl">
      {cats.map((cat) => (
        <div key={cat} className="bg-surface rounded-lg border border-midnight-border/40 p-md">
          <div className="mb-sm text-sm font-semibold text-ink-strong">
            {BADGE_CATEGORIES[cat]}
          </div>
          <div className="grid gap-sm sm:grid-cols-2">
            {groups[cat].map((ub) => (
              <BadgeCard key={ub.id || ub.badge_id} item={ub} threshold={threshold} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByCategory(items: Item[]) {
  return items.reduce<Record<string, Item[]>>((acc, it) => {
    const cat = it.badges?.category || 'uncat';
    acc[cat] ||= [];
    acc[cat].push(it);
    return acc;
  }, {});
}

function BadgeCard({ item, threshold = BADGE_VERIFICATION_THRESHOLD_DEFAULT }: { item: Item; threshold?: number }) {
  const status = item.status;
  const isVerified = status === 'verified';
  const isExpired = status === 'expired';
  const locked = item.locked && !item.id;
  const border = locked ? 'border-dashed border-midnight-border/60 opacity-60' : isExpired ? 'border-midnight-border/40 opacity-60' : isVerified ? 'border-amber-400' : 'border-midnight-border/60';
  const glow = isVerified ? 'shadow-[0_0_0_2px_rgba(251,191,36,0.25)]' : '';
  const opacity = locked ? 'grayscale' : '';
  const endorsements = item.endorsements ?? 0;
  const remaining = !isVerified ? Math.max(0, threshold - endorsements) : 0;

  return (
    <div className={`flex items-start gap-sm rounded-lg border ${border} p-sm bg-surface-alt ${glow} ${opacity}`}>
      <div className="text-2xl">{locked ? '🔒' : '🏅'}</div>
      <div className="flex-1">
        <div className="font-semibold text-ink">{item.badges?.name || 'Badge'}</div>
        <div className="text-xs text-ink-medium">
          {locked ? 'Locked' : labelForStatus(status)}
          {item.endorsements !== undefined && !locked && status !== 'verified' && (
            <> · {endorsements}/{threshold} endorsements{remaining > 0 && ` (${remaining} more needed)`}</>
          )}
          {item.endorsements !== undefined && status === 'verified' && ' · verified'}
        </div>
        {item.badges?.description && (
          <div className="text-sm text-ink-medium mt-xxs">{item.badges.description}</div>
        )}
        {!locked && !isVerified && endorsements > 0 && (
          <div className="mt-xs h-1.5 w-full rounded bg-ink-subtle overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, (endorsements/threshold)*100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function labelForStatus(s: BadgeStatus) {
  if (s === 'verified') return 'Verified';
  if (s === 'expired') return 'Expired';
  return 'Unverified';
}
