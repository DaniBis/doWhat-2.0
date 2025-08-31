"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Props = { activityId?: string | null };

export default function RsvpBadges({ activityId }: Props) {
  const [going, setGoing] = useState<number | null>(null);
  const [interested, setInterested] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!activityId) return;
    async function refresh() {
      const [{ count: g }, { count: i }] = await Promise.all([
        supabase
          .from("rsvps")
          .select("status", { count: "exact", head: true })
          .eq("activity_id", activityId)
          .eq("status", "going"),
        supabase
          .from("rsvps")
          .select("status", { count: "exact", head: true })
          .eq("activity_id", activityId)
          .eq("status", "interested"),
      ]);
      if (mounted) {
        setGoing(g ?? 0);
        setInterested(i ?? 0);
      }
    }

    refresh();

    const channel = supabase
      .channel(`rsvps:activity:${activityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      mounted = false;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [activityId]);

  if (!activityId) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-gray-700">
      <span className="rounded bg-gray-100 px-2 py-0.5">Going: {going ?? "—"}</span>
      <span className="rounded bg-gray-100 px-2 py-0.5">Interested: {interested ?? "—"}</span>
    </div>
  );
}
