"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from "@/lib/supabase/browser";


type Status = "going" | "interested" | "declined";
type Props = {
  activityId: string;
  sessionId?: string | null;
  disabled?: boolean;
};

export default function RsvpBox({ activityId, sessionId = null, disabled = false }: Props) {
  const sb = supabase;

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [goingCount, setGoingCount] = useState<number | null>(null);
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  interface RsvpRow { user_id: string }
  interface ProfileRow { id: string; full_name: string | null; avatar_url: string | null }
  interface Attendee { id: string | null; initial: string; avatar_url: string | null }
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  useEffect(() => {
  let mounted = true;
  let channel: RealtimeChannel | null = null;
    (async () => {
      setErr(null);
      setMsg(null);
      // get user
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id ?? null;

      const filterColumn = sessionId ? "session_id" : "activity_id";
      const filterValue = sessionId ?? activityId;

      // get current RSVP
      if (uid) {
        const { data, error } = await sb
          .from("rsvps")
          .select("status")
          .eq(filterColumn, filterValue)
          .eq("user_id", uid)
          .maybeSingle();

        if (mounted) {
          if (error) setErr(error.message);
          else setStatus((data?.status as Status) ?? null);
        }
      }

      async function refreshCountsAndPeople() {
        try {
          const [goingResp, interestedResp, goingRows] = await Promise.all([
            sb
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq(filterColumn, filterValue)
              .eq("status", "going"),
            sb
              .from("rsvps")
              .select("status", { count: "exact", head: true })
              .eq(filterColumn, filterValue)
              .eq("status", "interested"),
            sb
              .from("rsvps")
              .select("user_id")
              .eq(filterColumn, filterValue)
              .eq("status", "going"),
          ]);
          if (!mounted) return;
          setGoingCount(goingResp.count ?? 0);
            setInterestedCount(interestedResp.count ?? 0);
          const ids = (goingRows.data ?? []).map((r: RsvpRow) => r.user_id).filter(Boolean);
          if (ids.length) {
            const { data: profiles } = await sb
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", ids);
            if (!mounted) return;
            const profileMap = new Map((profiles ?? []).map((p: ProfileRow) => [p.id, p]));
            const items: Attendee[] = ids.map((id) => {
              const profile = profileMap.get(id) ?? null;
              const name = profile?.full_name || "Explorer";
              const init = name.trim().slice(0, 1).toUpperCase() || "E";
              return { id, initial: init, avatar_url: profile?.avatar_url ?? null };
            });
            setAttendees(items);
          } else {
            setAttendees([]);
          }
        } catch {
          // silent – counts not critical
        }
      }

      await refreshCountsAndPeople();

      channel = sb
        .channel(`rsvps:${filterColumn}:${filterValue}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rsvps', filter: `${filterColumn}=eq.${filterValue}` },
          () => refreshCountsAndPeople()
        )
        .subscribe();
    })();
    return () => {
      mounted = false;
      try {
        if (channel) sb.removeChannel(channel);
      } catch {}
    };
  }, [activityId, sessionId, sb]);

  async function doRsvp(next: Status) {
    if (loading) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { data: auth } = await sb.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Please sign in first.");

      const filterColumn = sessionId ? "session_id" : "activity_id";
      const filterValue = sessionId ?? activityId;

      const upsert = {
        activity_id: activityId,
        session_id: sessionId,
        user_id: uid,
        status: next,
      };

      const { error } = await sb.from("rsvps").upsert(upsert, { onConflict: "activity_id,user_id" });
      if (error) throw error;

		setStatus(next);
		setMsg(next === "going" ? "You're going! 🎉" : "Marked interested.");

      if (sessionId && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("session-rsvp-updated", {
            detail: { sessionId, status: next, userId: uid },
          })
        );
      }

      // refresh counts after upsert
      try {
        const [{ count: going }, { count: interested }] = await Promise.all([
          sb
            .from("rsvps")
            .select("status", { count: "exact", head: true })
            .eq(filterColumn, filterValue)
            .eq("status", "going"),
          sb
            .from("rsvps")
            .select("status", { count: "exact", head: true })
            .eq(filterColumn, filterValue)
            .eq("status", "interested"),
        ]);
        setGoingCount(going ?? 0);
        setInterestedCount(interested ?? 0);
      } catch {}
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Button disable logic
  const disableGoing = loading || disabled || status === "going";
  const disableInterested = loading || disabled || status === "interested";

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

      </div>

      {msg && <div className="mt-3 text-sm text-green-700">{msg}</div>}
      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      <div className="mt-3 text-xs text-gray-600">
        <span className="mr-4">Going: {goingCount ?? "—"}</span>
        <span>Interested: {interestedCount ?? "—"}</span>
      </div>
      {attendees.length > 0 && (
        <div className="mt-2 flex gap-2">
          {attendees.slice(0, 8).map((p, i) => {
            const content = p.avatar_url ? (
              <Image
                src={p.avatar_url}
                alt={p.initial}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-teal/10">
                <span className="text-xs font-semibold text-brand-teal">{p.initial}</span>
              </div>
            );
            if (!p.id) {
              return (
                <span key={`anon-${i}`} className="inline-block">
                  {content}
                </span>
              );
            }
            return (
              <Link key={p.id} href={`/users/${p.id}`} className="transition hover:-translate-y-0.5">
                {content}
              </Link>
            );
          })}
          {attendees.length > 8 && (
            <span className="text-xs text-gray-500">+{attendees.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}
