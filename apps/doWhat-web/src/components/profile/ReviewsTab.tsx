"use client";
import { useEffect, useState } from 'react';

interface ReviewSummary { avg?: number; count: number; tags: Record<string, number>; }

export function ReviewsTab({ userId }: { userId: string }) {
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{ (async()=>{ setLoading(true); try { const r = await fetch(`/api/profile/${userId}/reviews?summary=1`); setData(await r.json()); } catch { setData({ avg: undefined, count: 0, tags: {} }); } finally { setLoading(false);} })(); },[userId]);
  return (
    <div className="space-y-xl">
      <div className="rounded-xl bg-surface border border-midnight-border/40 p-xl shadow-sm">
        <h3 className="font-semibold mb-md text-ink-strong">Reviews Summary</h3>
        {loading && <div className="text-sm text-ink-muted">Loading…</div>}
        {!loading && data && (
          <div className="space-y-md">
            <div className="flex items-end gap-md">
              <div>
                <div className="text-xs uppercase text-ink-muted">Average Rating</div>
                <div className="text-3xl font-semibold text-ink-strong tabular-nums">{data.avg ? data.avg.toFixed(2) : '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-ink-muted">Count</div>
                <div className="text-xl font-medium text-ink-strong tabular-nums">{data.count}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-ink-muted mb-xs">Tags</div>
              <div className="flex flex-wrap gap-xs">
                {Object.keys(data.tags).length === 0 && <span className="text-xs text-ink-muted">None</span>}
                {Object.entries(data.tags).map(([t,v]) => (
                  <span key={t} className="text-xs px-xs py-xxs rounded-full bg-surface-alt border border-midnight-border/40 text-ink-strong">{t} <span className="text-ink-muted">{v}</span></span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
