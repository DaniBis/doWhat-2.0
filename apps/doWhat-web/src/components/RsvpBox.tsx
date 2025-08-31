"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";


type Status = "going" | "interested" | "declined";
type Props = {
  activityId: string;
  disabled?: boolean;   // <— NEW
};

export default function RsvpBox({ activityId, disabled = false }: Props) {
  const sb = supabase;

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [goingCount, setGoingCount] = useState<number | null>(null);
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<{ initial: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    let channel: any;
    (async () => {
      setErr(null);
      setMsg(null);
      // get user
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (mounted) setUserId(uid);

      // get current RSVP
      if (uid) {
        const { data, error } = await sb
          .from("rsvps")
          .select("status")
          .eq("activity_id", activityId)
          .eq("user_id", uid)
          .maybeSingle();

        if (mounted) {
          if (error) setErr(error.message);
          else setStatus((data?.status as Status) ?? null);
        }
      }

      async function refreshCountsAndPeople() {
        try {
          const [{ count: going }, { count: interested }, goingRows] = await Promise.all([
            sb
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq("activity_id", activityId)
              .eq("status", "going"),
            sb
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq("activity_id", activityId)
              .eq("status", "interested"),
            sb
              .from("rsvps")
              .select("user_id")
              .eq("activity_id", activityId)
              .eq("status", "going"),
          ]);
          if (mounted) {
            setGoingCount(going ?? 0);
            setInterestedCount(interested ?? 0);
            const ids = (goingRows.data ?? []).map((r: any) => r.user_id).filter(Boolean);
            if (ids.length) {
              const { data: profiles } = await sb
                .from("profiles")
                .select("full_name, avatar_url, id")
                .in("id", ids);
              const items = (profiles ?? []).map((p: any) => {
                const name = p.full_name || "?";
                const init = String(name).trim().slice(0, 1).toUpperCase();
                return { initial: init, avatar_url: p.avatar_url as string | null } as any;
              });
              setAttendees(items);
            } else {
              setAttendees([]);
            }
          }
        } catch {}
      }

      await refreshCountsAndPeople();

      channel = sb
        .channel(`rsvps:activity:${activityId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rsvps', filter: `activity_id=eq.${activityId}` },
          () => refreshCountsAndPeople()
        )
        .subscribe();
    })();
    return () => {
      mounted = false;
      try {
        if (channel) sb.removeChannel(channel as any);
      } catch {}
    };
  }, [activityId, sb]);

  async function doRsvp(next: Status) {
    if (loading) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Please sign in first.");

      const upsert = {
        activity_id: activityId,
        user_id: uid,
        status: next,
      };

      const { error } = await sb.from("rsvps").upsert(upsert, { onConflict: "activity_id,user_id" });
      if (error) throw error;

      setStatus(next);
      setMsg(
        next === "going"
          ? "You're going! 🎉"
          : next === "interested"
          ? "Marked interested."
          : "Marked declined."
      );

      // refresh counts after upsert
      try {
        const [{ count: going }, { count: interested }] = await Promise.all([
          sb
            .from("rsvps")
            .select("status", { count: "exact", head: true })
            .eq("activity_id", activityId)
            .eq("status", "going"),
          sb
            .from("rsvps")
            .select("status", { count: "exact", head: true })
            .eq("activity_id", activityId)
            .eq("status", "interested"),
        ]);
        setGoingCount(going ?? 0);
        setInterestedCount(interested ?? 0);
      } catch {}
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Button disable logic
  const disableGoing = loading || disabled || status === "going";
  const disableInterested = loading || disabled || status === "interested";
  const disableDeclined = loading || disabled || status === "declined";

  return (
    <div className="mt-5">
      <p>
        Your current status: <b>{status ?? "no rsvp"}</b>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-xl bg-brand-teal px-4 py-2 text-white disabled:opacity-50"
          disabled={disableGoing}
          onClick={() => doRsvp("going")}
          title={disabled ? "This activity is full" : ""}
        >
          I’m going
        </button>

        <button
          className="rounded-xl border border-brand-teal/40 px-4 py-2 disabled:opacity-50"
          disabled={disableInterested}
          onClick={() => doRsvp("interested")}
          title={disabled ? "This activity is full" : ""}
        >
          I’m interested
        </button>

        <button
          className="rounded-xl border border-gray-300 px-4 py-2 disabled:opacity-50"
          disabled={disableDeclined}
          onClick={() => doRsvp("declined")}
        >
          Can’t make it
        </button>
      </div>

      {msg && <div className="mt-3 text-sm text-green-700">{msg}</div>}
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      <div className="mt-3 text-xs text-gray-600">
        <span className="mr-4">Going: {goingCount ?? "—"}</span>
        <span>Interested: {interestedCount ?? "—"}</span>
      </div>
      {attendees.length > 0 && (
        <div className="mt-2 flex gap-2">
          {attendees.slice(0, 8).map((p: any, i) => (
            p.avatar_url ? (
              <img key={i} src={p.avatar_url} alt={p.initial} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div key={i} className="grid h-6 w-6 place-items-center rounded-full bg-brand-teal/10">
                <span className="text-xs font-semibold text-brand-teal">{p.initial}</span>
              </div>
            )
          ))}
          {attendees.length > 8 && (
            <span className="text-xs text-gray-500">+{attendees.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}
