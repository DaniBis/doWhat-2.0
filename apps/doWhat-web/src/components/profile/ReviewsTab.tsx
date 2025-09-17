"use client";
import { useEffect, useState } from 'react';

interface ReviewSummary { avg?: number; count: number; tags: Record<string, number>; }

export function ReviewsTab({ userId }: { userId: string }) {
  const [data, setData] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{ (async()=>{ setLoading(true); try { const r = await fetch(`/api/profile/${userId}/reviews?summary=1`); setData(await r.json()); } catch { setData({ avg: undefined, count: 0, tags: {} }); } finally { setLoading(false);} })(); },[userId]);
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold mb-4 text-gray-800">Reviews Summary</h3>
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {!loading && data && (
          <div className="space-y-4">
            <div className="flex items-end gap-4">
              <div>
                <div className="text-xs uppercase text-gray-500">Average Rating</div>
                <div className="text-3xl font-semibold text-gray-800 tabular-nums">{data.avg ? data.avg.toFixed(2) : '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-gray-500">Count</div>
                <div className="text-xl font-medium text-gray-700 tabular-nums">{data.count}</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500 mb-2">Tags</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(data.tags).length === 0 && <span className="text-xs text-gray-400">None</span>}
                {Object.entries(data.tags).map(([t,v]) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700">{t} <span className="text-gray-500">{v}</span></span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
