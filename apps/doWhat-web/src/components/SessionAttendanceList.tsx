"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

type Status = "going" | "interested" | "declined";

type Profile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Row = {
  session_id: string;
  status: Status;
  user_id: string;
  profiles?: Profile | null;
};

type AttendanceEventDetail = {
  sessionId?: string;
  status?: Status | null;
  userId?: string;
};

type SupabaseRow = Row & {
  profiles?: Profile | Profile[] | null;
};

type Props = {
  sessionId?: string | null;
  className?: string;
  showInterested?: boolean;
  variant?: "summary" | "detailed";
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
    console.warn("Failed to load profile for attendance update", error);
    return null;
  }
  return data ?? null;
}

export default function SessionAttendanceList({
  sessionId,
  className,
  showInterested = true,
  variant = "summary",
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!sessionId) return;

    const { data, error } = await supabase
      .from("session_attendees")
      .select("session_id, status, user_id, profiles(id, username, full_name, avatar_url)")
      .eq("session_id", sessionId)
      .in("status", ["going", "interested"]);

    if (error) {
      console.error("Failed to load session attendees", error);
      return;
    }

    const typed = (data ?? []) as SupabaseRow[];
    const normalized: Row[] = typed.map((item) => ({
      session_id: item.session_id,
      status: item.status,
      user_id: item.user_id,
      profiles: resolveProfile(item.profiles) ?? null,
    }));

    const deduped = new Map<string, Row>();
    normalized.forEach((row) => {
      deduped.set(row.user_id, row);
    });
    setRows(Array.from(deduped.values()));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    load();

    const channel = supabase
      .channel(`session_attendees:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_attendees", filter: `session_id=eq.${sessionId}` },
        load
      )
      .on("broadcast", { event: "session-attendance-refresh" }, load)
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [load, sessionId]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    const handler = async (event: Event) => {
      const custom = event as CustomEvent<AttendanceEventDetail>;
      if (custom.detail?.sessionId !== sessionId) {
        return;
      }
      if (!custom.detail?.userId) {
        return;
      }

      const { userId } = custom.detail;
      const status = custom.detail.status ?? null;

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
          session_id: sessionId,
          status,
          user_id: userId,
          profiles: profile,
        };
        return [...without, nextRow];
      });
    };
    window.addEventListener("session-attendance-updated", handler as EventListener);
    return () => {
      window.removeEventListener("session-attendance-updated", handler as EventListener);
    };
  }, [sessionId]);

  if (!sessionId) {
    return null;
  }

  const filteredRows = rows.filter((row) => row.status === "going" || row.status === "interested");

  if (variant === "detailed") {
    const order: Record<Status, number> = {
      going: 0,
      interested: 1,
      declined: 2,
    };
    const sorted = [...filteredRows].sort((a, b) => {
      return order[a.status] - order[b.status];
    });

    if (!sorted.length) {
      return (
        <div className={className}>
          <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-gray-500">
            No attendees yet. Invite friends to get the momentum going.
          </p>
        </div>
      );
    }

    const statusLabel = (status: Status) => (status === "going" ? "Going" : "Interested");
    const badgeClass = (status: Status) =>
      status === "going"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700";

    const displayName = (row: Row) =>
      row.profiles?.full_name || row.profiles?.username || "Explorer";

    return (
      <ul className={cn("flex flex-col gap-3", className)}>
        {sorted.map((row) => (
          <li
            key={row.user_id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <AvatarBubble row={row} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{displayName(row)}</p>
                {row.profiles?.username && (
                  <p className="truncate text-xs text-gray-500">@{row.profiles.username}</p>
                )}
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(row.status)}`}>
              {statusLabel(row.status)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  const { going, interested } = useMemo(() => {
    return {
      going: filteredRows.filter((row) => row.status === "going"),
      interested: filteredRows.filter((row) => row.status === "interested"),
    };
  }, [filteredRows]);

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
            <AvatarBubble key={row.user_id} row={row} />
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
