import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import SaveToggleButton from "@/components/SaveToggleButton";
import SessionAttendanceList from "@/components/SessionAttendanceList";
import { SessionAttendancePanel } from "@/components/SessionAttendancePanel";
import { SessionHostActions } from "@/components/SessionHostActions";
import { TraitVoteDialog, type TraitVoteRecipient } from "@/components/traits/TraitVoteDialog";
import { Button } from "@/components/ui/button";
import { getAttendanceCounts, hydrateSessions, type HydratedSession } from "@/lib/sessions/server";
import { buildSessionSavePayload, type ActivityRow } from "@dowhat/shared";
import { createClient } from "@/lib/supabase/server";
import type { Database, ProfileRow, SessionAttendeeRow, SessionRow } from "@/types/database";
import { fetchSessionOgContext, formatSessionOgDate, type SessionOgContext } from "./og-data";

type AttendanceStatus = SessionAttendeeRow["status"];

type SessionPageProps = { params: { id: string } };

const FALLBACK_METADATA_TITLE = "Session – Social Sweat";

export async function generateMetadata({ params }: SessionPageProps): Promise<Metadata> {
  const context = await fetchSessionOgContext(params.id);
  if (!context) {
    return {
      title: FALLBACK_METADATA_TITLE,
    };
  }

  const baseUrl = getBaseUrl();
  const description = buildSessionShareDescription(context);
  const title = `${context.title} – Social Sweat`;
  const imageUrl = `${baseUrl}/sessions/${context.id}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${baseUrl}/sessions/${context.id}`,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

function getBaseUrl(): string {
  const hdrs = headers();
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (!host) {
    throw new Error("Unable to determine base URL");
  }
  return `${protocol}://${host}`;
}

function buildSessionShareDescription(context: SessionOgContext): string {
  const slotDescriptor = context.openSlots > 0
    ? `Need ${context.openSlots} player${context.openSlots === 1 ? "" : "s"}`
    : "Bring your crew";
  const skillDescriptor = context.skillLabel ?? "All levels welcome";
  const { dateLabel, timeLabel } = formatSessionOgDate(context.startsAt);
  const timing = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
  return `${slotDescriptor} • ${skillDescriptor} • ${timing} @ ${context.venue}`;
}

export default async function SessionDetails({ params }: SessionPageProps) {
  const supabase = createClient();
  const [{ data: auth }, { data: sessionRow, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("sessions")
      .select("*")
      .eq("id", params.id)
      .maybeSingle<SessionRow>(),
  ]);

  if (error) {
    throw error;
  }
  if (!sessionRow) {
    notFound();
  }

  const [hydrated] = await hydrateSessions(supabase, [sessionRow]);
  if (!hydrated) {
    notFound();
  }

  const user = auth.user ?? null;
  const isHost = Boolean(user?.id && user.id === hydrated.hostUserId);

  const [counts, userStatus, participantRecipients] = await Promise.all([
    getAttendanceCounts(supabase, hydrated.id),
    user?.id ? getUserAttendanceStatus(supabase, hydrated.id, user.id) : Promise.resolve(null),
    loadSessionParticipants({ sessionId: hydrated.id, supabase, excludeUserId: user?.id }),
  ]);
  const actionableStatus = userStatus === "going" || userStatus === "interested" ? userStatus : null;

  const voteState = getVoteUnlockState(hydrated.endsAt ?? null);
  const scheduleLabel = formatSessionTimeRange(hydrated);
  const locationLabel = hydrated.venue?.name ?? hydrated.activity?.venueLabel ?? "Location TBA";
  const priceLabel = formatPrice(hydrated.priceCents);
  const hostLabel = hydrated.host?.fullName || hydrated.host?.username || "Your host";
  const description = hydrated.description || hydrated.activity?.description || null;
  const sessionLat = hydrated.venue?.lat ?? hydrated.activity?.lat ?? null;
  const sessionLng = hydrated.venue?.lng ?? hydrated.activity?.lng ?? null;
  const mapsHref = buildMapsLink(hydrated);
  const sessionRowForSave: ActivityRow = {
    id: hydrated.id,
    price_cents: hydrated.priceCents ?? null,
    starts_at: hydrated.startsAt ?? null,
    ends_at: hydrated.endsAt ?? null,
    activities: {
      id: hydrated.activity?.id ?? hydrated.activityId ?? undefined,
      name: hydrated.activity?.name ?? null,
    },
    venues: {
      name: hydrated.venue?.name ?? hydrated.activity?.venueLabel ?? null,
    },
  };

  const baseSavePayload = buildSessionSavePayload(sessionRowForSave, { source: "web_session_detail" });
  const savePayload = baseSavePayload
    ? {
        ...baseSavePayload,
        venueId: hydrated.venue?.id ?? hydrated.venueId ?? baseSavePayload.venueId,
        address: hydrated.venue?.address ?? hydrated.activity?.venueLabel ?? baseSavePayload.address,
        metadata: {
          ...(baseSavePayload.metadata ?? {}),
          sessionId: hydrated.id,
          sessionVisibility: hydrated.visibility,
          scheduleLabel,
          priceLabel,
          locationLabel,
          hostLabel,
          hostUserId: hydrated.hostUserId,
          hostProfileId: hydrated.host?.id ?? null,
          userAttendanceStatus: userStatus,
          sessionDescription: hydrated.description,
          activityDescription: hydrated.activity?.description ?? null,
          lat: sessionLat,
          lng: sessionLng,
        },
      }
    : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <header className="rounded-3xl border border-emerald-50 bg-white/70 p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Session</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900">{hydrated.activity?.name ?? "Activity"}</h1>
        {description && <p className="mt-4 text-base text-gray-700">{description}</p>}

        {savePayload ? (
          <div className="mt-6 flex justify-end">
            <SaveToggleButton payload={savePayload} size="md" className="w-full justify-center sm:w-auto" />
          </div>
        ) : null}

        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          <InfoItem label="Schedule" value={scheduleLabel} />
          <InfoItem
            label="Location"
            value={locationLabel}
            href={mapsHref}
            helper={mapsHref ? "Open in Maps" : undefined}
          />
          <InfoItem label="Host" value={hostLabel} helper={hydrated.host ? undefined : "Assigned host TBD"} />
          <InfoItem label="Price" value={priceLabel} />
          <InfoItem label="Capacity" value={`${hydrated.maxAttendees} spots`} />
          <InfoItem label="Visibility" value={hydrateVisibility(hydrated.visibility)} />
        </dl>
      </header>

      <SessionAttendancePanel
        sessionId={hydrated.id}
        maxAttendees={hydrated.maxAttendees}
        initialStatus={actionableStatus}
        initialCounts={counts}
        hostUserId={hydrated.hostUserId}
        currentUserId={user?.id ?? null}
      />

      {isHost ? (
        <section className="rounded-3xl border border-emerald-100 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Host controls</h2>
              <p className="text-sm text-gray-600">
                You can edit or delete this session. Attendees only see roster data you share.
              </p>
            </div>
            <SessionHostActions sessionId={hydrated.id} />
            <div className="mt-4 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Attendee roster</h3>
                <p className="text-sm text-gray-600">Status badges update live as people respond.</p>
              </div>
              <SessionAttendanceList sessionId={hydrated.id} variant="detailed" />
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-gray-100 bg-white/70 p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Who’s attending</h2>
            <p className="text-sm text-gray-600">Live list of friends that marked themselves as going or interested.</p>
          </div>
          <SessionAttendanceList sessionId={hydrated.id} />
        </section>
      )}

      {user && (
        <section className="rounded-3xl border border-gray-100 bg-white/70 p-6 shadow-sm">
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">Post-session vibes</h2>
            <p className="text-sm text-gray-600">{voteState.helperText}</p>
          </div>
          <TraitVoteDialog
            sessionId={hydrated.id}
            participants={participantRecipients}
            trigger={
              <Button variant="outline" className="w-full sm:w-auto" disabled={!voteState.unlocked}>
                {voteState.buttonLabel}
              </Button>
            }
          />
        </section>
      )}
    </main>
  );
}

type ParticipantLoaderInput = {
  sessionId: string;
  supabase: SupabaseClient<Database>;
  excludeUserId?: string;
};

async function loadSessionParticipants({ sessionId, supabase, excludeUserId }: ParticipantLoaderInput): Promise<TraitVoteRecipient[]> {
  const { data: attendees } = await supabase
    .from("session_attendees")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("status", "going");

  type AttendanceRow = Pick<SessionAttendeeRow, "user_id">;
  const typedRows = (attendees ?? []) as AttendanceRow[];

  const attendeeIds = Array.from(
    new Set(
      typedRows
        .map((row) => row.user_id)
        .filter((value): value is string => Boolean(value) && value !== excludeUserId),
    ),
  );

  if (!attendeeIds.length) {
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

async function getUserAttendanceStatus(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  userId: string,
): Promise<AttendanceStatus | null> {
  const { data, error } = await supabase
    .from("session_attendees")
    .select("status")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<{ status: AttendanceStatus }>();
  if (error) {
    throw error;
  }
  return data?.status ?? null;
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

function formatSessionTimeRange(session: HydratedSession): string {
  if (!session.startsAt) {
    return "Schedule TBA";
  }
  const start = new Date(session.startsAt);
  const end = session.endsAt ? new Date(session.endsAt) : null;
  if (Number.isNaN(start.getTime())) {
    return "Schedule TBA";
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const startTime = timeFormatter.format(start);
  if (!end || Number.isNaN(end.getTime())) {
    return `${dateLabel} · ${startTime}`;
  }
  const endTime = timeFormatter.format(end);
  return `${dateLabel} · ${startTime} – ${endTime}`;
}

function formatPrice(priceCents: number | null): string {
  if (!priceCents) {
    return "Free";
  }
  const currency = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "EUR";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

function buildMapsLink(session: HydratedSession): string | null {
  const lat = session.venue?.lat ?? session.activity?.lat;
  const lng = session.venue?.lng ?? session.activity?.lng;
  if (lat == null || lng == null) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function hydrateVisibility(value: HydratedSession["visibility"]): string {
  if (value === "friends") return "Friends";
  if (value === "private") return "Private";
  return "Public";
}

type InfoItemProps = {
  label: string;
  value: string;
  helper?: string;
  href?: string | null;
};

function InfoItem({ label, value, helper, href }: InfoItemProps) {
  const valueNode = href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-emerald-600 underline-offset-2 hover:underline"
    >
      {value}
    </a>
  ) : (
    <span>{value}</span>
  );

  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-base font-medium text-gray-900">{valueNode}</dd>
      {helper && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}
