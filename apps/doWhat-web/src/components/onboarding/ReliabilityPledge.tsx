"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

const PLEDGE_VERSION = "v1";

const COMMITMENTS = [
  {
    id: "confirm-attendance",
    title: "Confirm attendance early",
    description: "Update your status 12+ hours ahead so hosts can backfill your spot when plans shift.",
  },
  {
    id: "arrive-on-time",
    title: "Arrive on time",
    description: "Aim to reach the venue 10 minutes before first serve for dependable warmups.",
  },
  {
    id: "release-spot",
    title: "Release your spot",
    description: "Late cancels sting. Free the slot immediately so another Social Sweat member can jump in.",
  },
  {
    id: "respect-crew",
    title: "Respect every crew",
    description: "Keep play safe, supportive, and positive – the community works when everyone feels welcome.",
  },
] as const;

const buildCommitmentState = (checked: boolean) =>
  COMMITMENTS.reduce<Record<(typeof COMMITMENTS)[number]["id"], boolean>>((acc, item) => {
    acc[item.id] = checked;
    return acc;
  }, {} as Record<(typeof COMMITMENTS)[number]["id"], boolean>);

type ReliabilityPledgeProps = {
  className?: string;
};

const formatAck = (timestamp: string | null) => {
  if (!timestamp) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toDateString();
  }
};

export function ReliabilityPledge({ className }: ReliabilityPledgeProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [commitments, setCommitments] = useState(() => buildCommitmentState(false));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ackTimestamp, setAckTimestamp] = useState<string | null>(null);
  const [ackVersion, setAckVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!active) return;
        const user = auth?.user;
        if (!user) {
          setError("Please sign in to continue.");
          return;
        }
        setUserId(user.id);
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("reliability_pledge_ack_at, reliability_pledge_version")
          .eq("id", user.id)
          .maybeSingle<{ reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null }>();
        if (!active) return;
        if (profileError && profileError.code !== "PGRST116") {
          throw profileError;
        }
        if (profileRow?.reliability_pledge_ack_at) {
          setCommitments(buildCommitmentState(true));
          setAckTimestamp(profileRow.reliability_pledge_ack_at);
          setAckVersion(profileRow.reliability_pledge_version);
          setSuccess("Thanks for keeping Social Sweat reliable – edit anytime.");
        }
      } catch (err) {
        console.error("[ReliabilityPledge] failed to load state", err);
        if (active) setError("Could not load your pledge. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const toggleCommitment = useCallback((id: keyof typeof commitments) => {
    setError(null);
    setSuccess(null);
    setCommitments((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const allConfirmed = useMemo(() => COMMITMENTS.every((item) => commitments[item.id]), [commitments]);

  const handleSave = useCallback(async () => {
    if (!userId) {
      setError("Please sign in to continue.");
      return;
    }
    if (!allConfirmed) {
      setError("Agree to every commitment to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const timestamp = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          reliability_pledge_ack_at: timestamp,
          reliability_pledge_version: PLEDGE_VERSION,
          updated_at: timestamp,
        })
        .eq("id", userId);
      if (profileError) throw profileError;
      setAckTimestamp(timestamp);
      setAckVersion(PLEDGE_VERSION);
      setSuccess("Reliability pledge saved! We’ll nudge you if expectations change.");
      router.prefetch("/profile");
    } catch (err) {
      console.error("[ReliabilityPledge] failed to save", err);
      setError("Could not save your pledge. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [allConfirmed, router, userId]);

  const ready = Boolean(userId && allConfirmed && !saving);
  const formattedAck = formatAck(ackTimestamp);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-100/40 px-2 py-0.5 text-xs font-semibold text-amber-700">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Reliability pledge
        </div>
        <h2 className="text-2xl font-semibold text-slate-900">Keep every session trustworthy</h2>
        <p className="text-sm text-slate-600">
          Social Sweat only works when everyone follows through. Review the commitments below and lock the pledge so hosts know they can count on you.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">Preparing your pledge…</div>
        ) : (
          <div className="space-y-3">
            {COMMITMENTS.map((commitment) => {
              const selected = commitments[commitment.id];
              return (
                <button
                  key={commitment.id}
                  type="button"
                  onClick={() => toggleCommitment(commitment.id)}
                  disabled={saving}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300",
                  )}
                  aria-pressed={selected}
                >
                  <span className={cn("mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border", selected ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-slate-200 text-slate-400")}
                    aria-hidden
                  >
                    {selected ? <Sparkles className="h-3.5 w-3.5" /> : commitment.title[0]}
                  </span>
                  <span>
                    <span className="text-base font-semibold leading-tight">{commitment.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{commitment.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {formattedAck ? (
          <p className="text-sm text-emerald-700">
            You accepted version {ackVersion ?? PLEDGE_VERSION} on {formattedAck}. Feel free to review or update it anytime.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Select each commitment to enable the pledge button.</p>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Button onClick={handleSave} disabled={!ready} className="ml-auto min-w-[180px]">
            {saving ? "Saving…" : ackTimestamp ? "Update pledge" : "Lock the pledge"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
