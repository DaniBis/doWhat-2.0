"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  trackAttendanceDisputeSubmitted,
  trackReliabilityContestOpened,
  trackReliabilityDisputeHistoryViewed,
  trackReliabilityDisputeHistoryFailed,
  type ReliabilityDisputeHistoryViewedPayload,
} from "@dowhat/shared";
import { supabase } from "@/lib/supabase/browser";
import {
  DEFAULT_DISPUTE_STATUS_TOKEN,
  DISPUTE_STATUS_TOKENS,
  type DisputeStatus,
} from "@/lib/disputes/statusTokens";

type Status = "going" | "interested" | "declined";

type Session = {
  id: string; // session id
  activity_id: string; // FK
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

type SessionWithStatus = Session & { status: Status };

type SessionAttendeeRow = {
  session_id: string;
  status: Status;
  sessions?: Session | Session[] | null;
};

const MAX_DETAILS_LENGTH = 1000;

type DisputeHistoryItem = {
  id: string;
  sessionId: string;
  status: DisputeStatus;
  reason: string;
  details: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    title: string | null;
    venue: string | null;
    endsAt: string | null;
    startsAt: string | null;
  };
};

function resolveSession(raw?: Session | Session[] | null): Session | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

function formatTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString();
}

export default function MyAttendancePage() {
  const [rows, setRows] = useState<SessionWithStatus[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [disputeSession, setDisputeSession] = useState<SessionWithStatus | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeSuccess, setDisputeSuccess] = useState<string | null>(null);
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [submittedDisputes, setSubmittedDisputes] = useState<Set<string>>(() => new Set<string>());
  const [disputeHistory, setDisputeHistory] = useState<DisputeHistoryItem[]>([]);
  const [disputeHistoryError, setDisputeHistoryError] = useState<string | null>(null);
  const [disputeHistoryLoading, setDisputeHistoryLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const disputeBySession = useMemo(() => {
    const map = new Map<string, DisputeHistoryItem>();
    for (const entry of disputeHistory) {
      if (entry.status === "dismissed") continue;
      const existing = map.get(entry.sessionId);
      if (!existing) {
        map.set(entry.sessionId, entry);
        continue;
      }
      const existingDate = Date.parse(existing.createdAt);
      const entryDate = Date.parse(entry.createdAt);
      if (Number.isNaN(existingDate) || entryDate > existingDate) {
        map.set(entry.sessionId, entry);
      }
    }
    return map;
  }, [disputeHistory]);

  const refreshDisputeHistory = useCallback(async (
    source: ReliabilityDisputeHistoryViewedPayload["source"] = "auto-load"
  ) => {
    setDisputeHistoryLoading(true);
    setDisputeHistoryError(null);
    try {
      const response = await fetch("/api/disputes", { credentials: "include" });
      let payload: { disputes?: DisputeHistoryItem[]; error?: string } | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load dispute history.");
      }
      const list = Array.isArray(payload?.disputes) ? payload.disputes : [];
      setDisputeHistory(list);
      setSubmittedDisputes(new Set(list.filter((item) => item.status !== "dismissed").map((item) => item.sessionId)));
      trackReliabilityDisputeHistoryViewed({
        platform: "web",
        surface: "my-attendance",
        disputes: list.length,
        source,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load dispute history.";
      setDisputeHistoryError(message);
      setDisputeHistory([]);
      setSubmittedDisputes(new Set<string>());
      trackReliabilityDisputeHistoryFailed({
        platform: "web",
        surface: "my-attendance",
        source,
        error: message,
      });
    } finally {
      setDisputeHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setUserId(null);
        setErr("Please sign in to see your attendance history.");
        setLoading(false);
        return;
      }
      setUserId(uid);
      const { data: attendeeRows, error } = await supabase
        .from("session_attendees")
        .select(
          "session_id,status, sessions(id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name))"
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const typedRows = (attendeeRows ?? []) as SessionAttendeeRow[];
      const normalized = typedRows
        .map((row) => {
          const session = resolveSession(row.sessions);
          if (!session) return null;
          return { ...session, status: row.status } as SessionWithStatus;
        })
        .filter((value): value is SessionWithStatus => value !== null);

      setRows(normalized);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshDisputeHistory("auto-load");
  }, [userId, refreshDisputeHistory]);

  async function updateStatus(sessionId: string, next: Status) {
    setErr(null);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return setErr("Please sign in first.");
    const { error } = await supabase
      .from("session_attendees")
      .upsert({ session_id: sessionId, user_id: uid, status: next }, { onConflict: "session_id,user_id" });
    if (error) return setErr(error.message);
    setRows((prev) =>
      prev.map((a) =>
        a.id === sessionId ? { ...a, status: next } : a
      )
    );
  }

  function openDisputeModal(session: SessionWithStatus) {
    trackReliabilityContestOpened({
      platform: "web",
      surface: "my-attendance",
      sessionId: session.id,
    });
    setDisputeSession(session);
    setDisputeReason("");
    setDisputeDetails("");
    setDisputeError(null);
    setDisputeSuccess(null);
  }

  function closeDisputeModal() {
    setDisputeSession(null);
    setDisputeReason("");
    setDisputeDetails("");
    setDisputeError(null);
    setDisputeSuccess(null);
    setSubmittingDispute(false);
  }

  async function submitDispute(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!disputeSession) return;

    const trimmedReason = disputeReason.trim();
    if (trimmedReason.length < 3) {
      setDisputeError("Provide at least 3 characters.");
      return;
    }
    if (trimmedReason.length > 120) {
      setDisputeError("Reason must be 120 characters or fewer.");
      return;
    }
    const trimmedDetails = disputeDetails.trim();
    if (trimmedDetails.length > MAX_DETAILS_LENGTH) {
      setDisputeError(`Details must be ${MAX_DETAILS_LENGTH} characters or fewer.`);
      return;
    }

    setSubmittingDispute(true);
    setDisputeError(null);
    try {
      const response = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: disputeSession.id,
          reason: trimmedReason,
          details: trimmedDetails ? trimmedDetails : null,
        }),
      });
      let payload: { error?: string } | null = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit dispute.");
      }
      setDisputeSuccess("Thanks! Our team will review this report.");
      trackAttendanceDisputeSubmitted({
        platform: "web",
        sessionId: disputeSession.id,
        hasDetails: Boolean(trimmedDetails),
        reasonLength: trimmedReason.length,
      });
      setSubmittedDisputes((prev) => {
        const next = new Set(prev);
        next.add(disputeSession.id);
        return next;
      });
      await refreshDisputeHistory("post-submit");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit dispute right now.";
      setDisputeError(message);
    } finally {
      setSubmittingDispute(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="text-brand-teal">&larr; Back</Link>
        <h1 className="text-lg font-semibold">My Attendance</h1>
      </div>
      {loading && <p>Loading…</p>}
      {err && <p className="text-red-600">{err}</p>}
      {!loading && !err && rows.length === 0 && <p>You have no attendance history yet.</p>}
      <ul className="space-y-3">
        {rows.map((session) => {
          const sessionTitle = session.activities?.name ?? "Activity";
          const venueLabel = session.venues?.name ?? "Venue";
          const startsLabel = session.starts_at ? new Date(session.starts_at).toLocaleString() : "Schedule tbd";
          const endsAt = session.ends_at ? new Date(session.ends_at) : null;
          const ended = endsAt ? endsAt.getTime() <= Date.now() : false;
          const contestable = session.status === "going" && ended;
          const disputeDisabled = submittedDisputes.has(session.id);
          const sessionDispute = disputeBySession.get(session.id);
          const disputeStatusToken = sessionDispute
            ? DISPUTE_STATUS_TOKENS[sessionDispute.status] ?? DEFAULT_DISPUTE_STATUS_TOKEN
            : null;

          return (
            <li key={session.id} className="rounded border p-4">
              <div className="font-semibold">{sessionTitle}</div>
              <div className="text-sm text-gray-600">{venueLabel}</div>
              <div className="mt-1 text-xs text-gray-500">Starts: {startsLabel}</div>
              {endsAt && (
                <div className="text-xs text-gray-500">Ended: {endsAt.toLocaleString()}</div>
              )}
              <div className="mt-2 text-sm">
                Status: <b>{session.status}</b>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="rounded border px-2 py-1" onClick={() => updateStatus(session.id, "going")}>
                  Going
                </button>
                <button className="rounded border px-2 py-1" onClick={() => updateStatus(session.id, "interested")}>
                  Interested
                </button>
                <Link
                  href={{ pathname: `/sessions/${session.id}` }}
                  className="ml-auto text-brand-teal"
                >
                  Open
                </Link>
              </div>
              {contestable ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-brand-teal px-3 py-1 text-sm font-semibold text-brand-teal transition hover:bg-brand-teal hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => openDisputeModal(session)}
                    disabled={disputeDisabled}
                  >
                    {disputeDisabled ? "Report submitted" : "Contest reliability"}
                  </button>
                  <p className="text-xs text-gray-500">Flag incorrect no-shows or late-cancel marks.</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500">
                  {session.status !== "going"
                    ? "Only confirmed attendees can contest reliability."
                    : "You can file a dispute once the session ends."}
                </p>
              )}
              {sessionDispute && disputeStatusToken && (
                <div className="mt-2 inline-flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Dispute status:</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${disputeStatusToken.className}`}
                  >
                    {disputeStatusToken.label}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <section className="mt-12 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Dispute history</h2>
            <p className="text-sm text-gray-500">Keep tabs on past reliability disputes and their status.</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50"
            onClick={() => refreshDisputeHistory("manual-refresh")}
            disabled={disputeHistoryLoading}
          >
            {disputeHistoryLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {disputeHistoryError && <p className="text-sm text-red-600">{disputeHistoryError}</p>}
        {disputeHistoryLoading && !disputeHistory.length && !disputeHistoryError && (
          <p className="text-sm text-gray-500">Loading dispute history…</p>
        )}
        {!disputeHistoryLoading && !disputeHistoryError && disputeHistory.length === 0 && (
          <p className="text-sm text-gray-500">You haven’t filed any disputes yet.</p>
        )}
        <ul className="space-y-3">
          {disputeHistory.map((dispute) => {
            const statusToken = DISPUTE_STATUS_TOKENS[dispute.status] ?? DEFAULT_DISPUTE_STATUS_TOKEN;
            const createdAtLabel = formatTimestamp(dispute.createdAt) ?? "—";
            const sessionEndedLabel = formatTimestamp(dispute.session.endsAt);
            const resolvedAtLabel = formatTimestamp(dispute.resolvedAt);
            return (
              <li key={dispute.id} className="rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{dispute.session.title ?? "Session"}</p>
                    <p className="text-xs text-gray-500">{dispute.session.venue ?? "Venue tbd"}</p>
                    {sessionEndedLabel && <p className="text-xs text-gray-500">Ended {sessionEndedLabel}</p>}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusToken.className}`}
                  >
                    {statusToken.label}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm text-gray-800">
                  <p className="font-medium">{dispute.reason}</p>
                  {dispute.details && <p className="text-xs text-gray-600">{dispute.details}</p>}
                </div>
                <p className="mt-2 text-xs text-gray-500">Filed {createdAtLabel}</p>
                {resolvedAtLabel && (
                  <p className="text-xs text-gray-500">Updated {resolvedAtLabel}</p>
                )}
                {dispute.resolutionNotes && (
                  <p className="mt-1 text-xs text-gray-600">Resolution notes: {dispute.resolutionNotes}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {disputeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeDisputeModal} />
          <form
            onSubmit={submitDispute}
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            aria-label="Contest reliability"
          >
            <h2 className="text-lg font-semibold">Contest reliability</h2>
            <p className="text-sm text-gray-600">Tell us what went wrong so we can review your score.</p>
            <div className="mt-4 space-y-1 text-sm">
              <p className="font-semibold text-gray-900">{disputeSession.activities?.name ?? "Session"}</p>
              {disputeSession.venues?.name && <p className="text-gray-600">{disputeSession.venues?.name}</p>}
              {disputeSession.ends_at && (
                <p className="text-xs text-gray-500">Ended {new Date(disputeSession.ends_at).toLocaleString()}</p>
              )}
            </div>
            {disputeError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {disputeError}
              </div>
            )}
            {disputeSuccess && (
              <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                {disputeSuccess}
              </div>
            )}
            <label className="mt-4 block text-sm font-semibold text-gray-800" htmlFor="dispute-reason">
              Reason
            </label>
            <input
              id="dispute-reason"
              type="text"
              value={disputeReason}
              onChange={(event) => setDisputeReason(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. I checked in with the host"
              maxLength={120}
              required
            />
            <label className="mt-4 block text-sm font-semibold text-gray-800" htmlFor="dispute-details">
              Details (optional)
            </label>
            <textarea
              id="dispute-details"
              value={disputeDetails}
              onChange={(event) => setDisputeDetails(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              maxLength={MAX_DETAILS_LENGTH}
              placeholder="Share anything that helps us verify you attended or why the mark is incorrect."
            />
            <p className="mt-1 text-xs text-gray-500">
              Hosts review dispute history, so keep the note focused on what happened.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-gray-300 px-4 py-2 text-sm"
                onClick={closeDisputeModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-brand-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={submittingDispute || Boolean(disputeSuccess)}
              >
                {disputeSuccess ? "Submitted" : submittingDispute ? "Submitting…" : "Submit dispute"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
