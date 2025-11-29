import type { SupabaseClient } from "@supabase/supabase-js";

import RsvpBox from "@/components/RsvpBox";
import { TraitVoteDialog, type TraitVoteRecipient } from "@/components/traits/TraitVoteDialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

interface SessionDetailRow {
  id: string;
  activity_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null; lat?: number | null; lng?: number | null } | null;
}

interface RsvpRow {
  user_id: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default async function ActivityDetails({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("sessions")
    .select("id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name,lat:lat,lng:lng)")
    .eq("id", params.id)
    .single();

  if (!data) return <div className="p-8">Not found.</div>;

  const session = data as SessionDetailRow;
  const activityName = session.activities?.name ?? "Activity";
  const activityId = session.activity_id || params.id;
  const venueLat = session.venues?.lat ?? null;
  const venueLng = session.venues?.lng ?? null;

  const participantRecipients = await loadSessionParticipants({ sessionId: session.id, supabase, excludeUserId: user?.id });
  const voteState = getVoteUnlockState(session.ends_at);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{activityName}</h1>
      {/* RSVP */}
      <RsvpBox activityId={activityId} />
      {venueLat != null && venueLng != null && (
        <a
          className="mt-4 inline-block text-brand-teal"
          href={`https://www.google.com/maps/search/?api=1&query=${venueLat},${venueLng}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maps
        </a>
      )}
      {user && (
        <section className="mt-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">Post-session vibes</h2>
            <p className="text-sm text-gray-600">{voteState.helperText}</p>
          </div>
          <TraitVoteDialog
            sessionId={session.id}
            participants={participantRecipients}
            trigger={
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!voteState.unlocked}
              >
                {voteState.buttonLabel}
              </Button>
            }
          />
        </section>
      )}
    </main>
  );
}

async function loadSessionParticipants({
  sessionId,
  supabase,
  excludeUserId,
}: {
  sessionId: string;
  supabase: SupabaseClient<Database>;
  excludeUserId?: string;
}): Promise<TraitVoteRecipient[]> {
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("status", "going");
  const attendeeIds = Array.from(
    new Set(
      (rsvps ?? [])
        .map((row) => (row as RsvpRow).user_id)
        .filter((value): value is string => Boolean(value) && value !== excludeUserId)
    )
  );
  if (attendeeIds.length === 0) {
    return [];
  }
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", attendeeIds);
  return attendeeIds.map<TraitVoteRecipient>((id) => {
    const profile = (profiles ?? []).find((row) => (row as ProfileRow).id === id) as ProfileRow | undefined;
    return {
      id,
      name: profile?.full_name || "Friend",
      avatarUrl: profile?.avatar_url,
    };
  });
}

function getVoteUnlockState(endsAt: string | null) {
  if (!endsAt) {
    return {
      unlocked: false,
      helperText: "Votes open once the host logs the session end.",
      buttonLabel: "Waiting for session to end",
    };
  }
  const endsAtDate = new Date(endsAt);
  if (Number.isNaN(endsAtDate.getTime())) {
    return {
      unlocked: false,
      helperText: "Session end time looks invalid. Ask the host to update it.",
      buttonLabel: "Session timing unknown",
    };
  }
  const unlockMs = endsAtDate.getTime() + 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (now >= unlockMs) {
    return {
      unlocked: true,
      helperText: "The cooldown window passed. Share vibes with your crew!",
      buttonLabel: "Nominate traits",
    };
  }
  const msRemaining = unlockMs - now;
  const hours = Math.max(1, Math.ceil(msRemaining / (60 * 60 * 1000)));
  const days = Math.floor(hours / 24);
  const relative = days >= 1
    ? `${days} day${days > 1 ? "s" : ""}`
    : `${hours} hour${hours > 1 ? "s" : ""}`;
  return {
    unlocked: false,
    helperText: `Votes unlock in about ${relative}. Only attendees can submit once it opens.`,
    buttonLabel: `Unlocks in ${relative}`,
  };
}
