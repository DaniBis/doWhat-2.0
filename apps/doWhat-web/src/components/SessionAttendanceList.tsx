"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/browser";

type Status = "going" | "interested" | "declined";

type Profile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Row = {
  id: string;
  status: Status;
  user_id: string;
  profiles?: Profile | null;
};

type SupabaseRow = Omit<Row, "profiles"> & {
  profiles?: Profile | Profile[] | null;
};

type Props = {
  sessionId?: string | null;
  className?: string;
  showInterested?: boolean;
  activityId?: string | null;
};

function resolveProfile(raw?: SupabaseRow["profiles"]): Profile | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

function initials(profile: Profile | null | undefined) {
  const source = profile?.full_name || profile?.username || "Explorer";
  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "EX";
  const raw = parts
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2);
  return raw.toUpperCase() || "EX";
}

function AvatarBubble({ row }: { row: Row }) {
  const profile = row.profiles;
  const userId = profile?.id ?? row.user_id;
  const title = profile?.full_name || profile?.username || "View profile";

  const displayInitials = initials(profile);
  const fallbackAvatarUrl = `https://ui-avatars.com/api/?background=ECFEFF&color=047857&name=${encodeURIComponent(
    displayInitials,
  )}`;
  const avatarUrl = profile?.avatar_url || fallbackAvatarUrl;

  const avatar = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt={title}
      className="h-full w-full rounded-full object-cover"
      referrerPolicy="no-referrer"
    />
  );

  const baseClasses =
    "relative flex h-8 w-8 items-center justify-center rounded-full border border-white bg-emerald-100 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200";
  const interactiveClasses = `${baseClasses} transition hover:-translate-y-0.5 hover:ring-emerald-400`;

  if (!userId) {
    return (
      <span className={baseClasses} title={title}>
        {avatar}
      </span>
    );
  }

  return (
    <Link href={`/users/${userId}`} className={interactiveClasses} title={title}>
      {avatar}
    </Link>
  );
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle<Profile>();
  if (error) {
    console.warn("Failed to load profile for RSVP", error);
    return null;
  }
  return data ?? null;
}

export default function SessionAttendanceList({
  sessionId,
  className,
  showInterested = true,
  activityId = null,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!sessionId && !activityId) return;

    const baseSelect = () =>
      supabase
        .from("rsvps")
        .select("id, status, user_id, profiles(id, username, full_name, avatar_url)")
        .in("status", ["going", "interested"]);

    const collected: SupabaseRow[] = [];

    if (sessionId) {
      const { data, error } = await baseSelect().eq("session_id", sessionId);
      if (error) {
        console.error("Failed to load session RSVPs", error);
      } else {
        collected.push(...((data ?? []) as SupabaseRow[]));
      }
    }

    if (activityId) {
      const { data, error } = await baseSelect()
        .is("session_id", null)
        .eq("activity_id", activityId);
      if (error) {
        console.error("Failed to load activity RSVPs", error);
      } else {
        collected.push(...((data ?? []) as SupabaseRow[]));
      }
    }

    const normalized: Row[] = collected.map((item) => ({
      id: item.id,
      status: item.status,
      user_id: item.user_id,
      profiles: resolveProfile(item.profiles) ?? null,
    }));
    const deduped = new Map<string, Row>();
    normalized.forEach((row) => {
      deduped.set(row.user_id, row);
    });
    setRows(Array.from(deduped.values()));
  }, [activityId, sessionId]);

  useEffect(() => {
    if (!sessionId && !activityId) return;

    load();

    const channels: Array<{ channel: ReturnType<typeof supabase.channel>; filter: string }> = [];

    if (sessionId) {
      channels.push({ channel: supabase.channel(`session-rsvps:${sessionId}`), filter: `session_id=eq.${sessionId}` });
    }
    if (activityId) {
      channels.push({ channel: supabase.channel(`activity-rsvps:${activityId}`), filter: `activity_id=eq.${activityId}` });
    }

    channels.forEach(({ channel, filter }) => {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rsvps", filter },
          load
        )
        .on("broadcast", { event: "rsvp-refresh" }, load)
        .subscribe();
    });

    return () => {
      channels.forEach(({ channel }) => {
        try {
          supabase.removeChannel(channel);
        } catch {}
      });
    };
  }, [activityId, load, sessionId]);

  useEffect(() => {
    if ((!sessionId && !activityId) || typeof window === "undefined") return;
    const handler = async (event: Event) => {
      const custom = event as CustomEvent<{ sessionId?: string; status?: Status; userId?: string }>;
      if (sessionId && custom.detail?.sessionId !== sessionId) {
        return;
      }
      if (!custom.detail?.userId) {
        return;
      }

      const { userId, status } = custom.detail;

      if (!status || status === "declined") {
        setRows((prev) => prev.filter((row) => row.user_id !== userId));
        return;
      }

      let existingRow: Row | undefined;
      setRows((prev) => {
        existingRow = prev.find((row) => row.user_id === userId);
        if (existingRow) {
          return prev.map((row) =>
            row.user_id === userId
              ? { ...row, status }
              : row
          );
        }
        return prev;
      });

      if (existingRow && existingRow.profiles) {
        return;
      }

      const profile = await fetchProfile(userId);
      setRows((prev) => {
        const without = prev.filter((row) => row.user_id !== userId);
        const nextRow: Row = {
          id: profile?.id ?? userId,
          status,
          user_id: userId,
          profiles: profile,
        };
        return [...without, nextRow];
      });
    };
    window.addEventListener("session-rsvp-updated", handler as EventListener);
    return () => {
      window.removeEventListener("session-rsvp-updated", handler as EventListener);
    };
  }, [sessionId]);

  const { going, interested } = useMemo(() => {
    const filtered = rows.filter((row) => row.status === "going" || row.status === "interested");
    return {
      going: filtered.filter((row) => row.status === "going"),
      interested: filtered.filter((row) => row.status === "interested"),
    };
  }, [rows]);

  if (!sessionId) {
    return null;
  }

  const maxAvatars = 5;

  const renderGroup = (label: string, people: Row[], accent: string) => {
    if (!people.length) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
          <span>{label}: 0</span>
        </div>
      );
    }

    const avatars = people.slice(0, maxAvatars);
    const remaining = people.length - avatars.length;

    return (
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>{`${label}: ${people.length}`}</span>
        <div className="flex -space-x-2">
          {avatars.map((row) => (
            <AvatarBubble key={row.id} row={row} />
          ))}
          {remaining > 0 && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
              +{remaining}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      {renderGroup("Going", going, "bg-emerald-100 text-emerald-700")}
      {showInterested && renderGroup("Interested", interested, "bg-amber-100 text-amber-700")}
    </div>
  );
}
