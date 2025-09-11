"use client";

import { Badge, BadgeStatus, BADGE_CATEGORIES, BadgeCategory } from "@dowhat/shared";

type Item = {
  id: string;
  badge_id: string;
  status: BadgeStatus;
  source: string;
  endorsements?: number;
  badges?: Partial<Badge> | null;
};

export default function BadgesGrid({ items }: { items: Item[] }) {
  const groups = groupByCategory(items);
  const cats = Object.keys(groups) as BadgeCategory[];

  if (!cats.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">🏆</div>
        <p>No badges yet. Participate and get endorsed to earn badges!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cats.map((cat) => (
        <div key={cat} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-3 text-sm font-semibold text-gray-700">
            {BADGE_CATEGORIES[cat]}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups[cat].map((ub) => (
              <BadgeCard key={ub.id} item={ub} />
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

function BadgeCard({ item }: { item: Item }) {
  const status = item.status;
  const isVerified = status === 'verified';
  const isExpired = status === 'expired';
  const border = isExpired ? 'border-gray-200 opacity-60' : isVerified ? 'border-amber-400' : 'border-gray-300';
  const glow = isVerified ? 'shadow-[0_0_0_2px_rgba(251,191,36,0.25)]' : '';

  return (
    <div className={`flex items-start gap-3 rounded-lg border ${border} p-3 bg-gray-50 ${glow}`}>
      <div className="text-2xl">🏅</div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{item.badges?.name || 'Badge'}</div>
        <div className="text-xs text-gray-600">{labelForStatus(status)}{item.endorsements ? ` · ${item.endorsements} endorsements` : ''}</div>
        {item.badges?.description && (
          <div className="text-sm text-gray-600 mt-1">{item.badges.description}</div>
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
