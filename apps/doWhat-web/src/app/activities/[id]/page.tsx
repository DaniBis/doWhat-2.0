import Link from "next/link";
import { format } from "date-fns";

import SessionAttendanceQuickActions from "@/components/SessionAttendanceQuickActions";
import SessionAttendanceList from "@/components/SessionAttendanceList";
import SaveToggleButton from "@/components/SaveToggleButton";
import { buildActivitySavePayload, type ActivityRow } from "@dowhat/shared";
import { createClient } from "@/lib/supabase/server";

export default async function ActivityPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  async function fetchActivity(activityId: string) {
    return supabase
      .from("activities")
      .select("id, name, description, activity_types, tags, rating, rating_count")
      .eq("id", activityId)
      .maybeSingle<{
        id: string;
        name: string;
        description?: string | null;
        activity_types?: string[] | null;
        tags?: string[] | null;
        rating?: number | null;
        rating_count?: number | null;
      }>();
  }

  let activityId = params.id;
  let activityResult = await fetchActivity(activityId);
  let activity = activityResult.data;

  if (!activity) {
    // If direct lookup fails, treat param as a session id and resolve its activity.
    const { data: sessionLookup } = await supabase
      .from("sessions")
      .select("activity_id")
      .eq("id", params.id)
      .maybeSingle<{ activity_id: string | null }>();

    if (sessionLookup?.activity_id) {
      activityId = sessionLookup.activity_id;
      activityResult = await fetchActivity(activityId);
      activity = activityResult.data;
    }
  }

  if (activityResult.error) {
    console.error(activityResult.error);
  }

  if (!activity) {
    return <div className="p-xl">Activity not found.</div>;
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, host_user_id, starts_at, ends_at, price_cents, description, venue_id, venues(id, name, lat, lng, address)"
    )
    .eq("activity_id", activityId)
    .order("starts_at", { ascending: true });

  const upcomingSessions = (sessions ?? []).filter((session) => {
    if (!session.starts_at) return true;
    const now = Date.now();
    return new Date(session.starts_at).getTime() >= now;
  });

  const purpose = activity.description ??
    (activity.activity_types?.length ? activity.activity_types.join(", ") : undefined) ??
    (activity.tags?.length ? activity.tags.join(", ") : undefined) ??
    "Explore available sessions and pick the one that fits your schedule.";

  type SessionRecord = NonNullable<typeof sessions>[number];

  const resolveSessionVenue = (session: SessionRecord | null | undefined) => {
    if (!session) {
      return { id: null as string | null, name: null as string | null, address: null as string | null };
    }
    const rel = Array.isArray(session.venues) ? session.venues[0] : session.venues;
    return {
      id: session.venue_id ?? rel?.id ?? null,
      name: rel?.name ?? null,
      address: rel?.address ?? null,
    };
  };

  const describeSession = (session: SessionRecord) => {
    const start = session.starts_at ? new Date(session.starts_at) : null;
    const end = session.ends_at ? new Date(session.ends_at) : null;
    const venueMeta = resolveSessionVenue(session);
    const venueLabel = venueMeta.name ?? "Flexible location";
    const timing = start
      ? `${format(start, "EEEE, MMMM d")} • ${format(start, "p")}${end ? ` → ${format(end, "p")}` : ""}`
      : "Schedule tbd";
    const priceCents = session.price_cents ?? 0;
    const priceLabel = priceCents <= 0 ? "Free" : `€${(priceCents / 100).toFixed(2)}`;
    return { timing, venueLabel, priceLabel };
  };

  const primarySession = upcomingSessions[0] ?? (sessions ?? [])[0] ?? null;
  const primaryVenueMeta = resolveSessionVenue(primarySession as SessionRecord | null | undefined);

  const sessionRowsForSave: ActivityRow[] = (sessions ?? []).map((session) => ({
    id: session.id,
    price_cents: session.price_cents ?? null,
    starts_at: session.starts_at ?? null,
    ends_at: session.ends_at ?? null,
    activities: {
      id: activity.id,
      name: activity.name,
    },
    venues: {
      name: resolveSessionVenue(session).name ?? null,
    },
  }));

  const baseSavePayload = buildActivitySavePayload(
    { id: activity.id, name: activity.name },
    sessionRowsForSave,
    { source: "web_activity_detail" },
  );

  const savePayload = baseSavePayload
    ? {
        ...baseSavePayload,
        venueId: primaryVenueMeta.id ?? baseSavePayload.venueId,
        address: primaryVenueMeta.address ?? baseSavePayload.address,
        metadata: {
          ...(baseSavePayload.metadata ?? {}),
          primarySessionId: primarySession?.id ?? null,
        },
      }
    : null;

  return (
    <div className="mx-auto max-w-4xl px-xl py-xxxl">
      <div className="flex flex-col gap-xl rounded-3xl border border-midnight-border/30 bg-surface/80 p-xxl shadow-sm">
        <div className="flex flex-col gap-md lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Activity</p>
            <h1 className="text-3xl font-bold text-ink">{activity.name}</h1>
            <p className="text-lg text-ink-strong">{purpose}</p>
            {(activity.rating ?? null) != null && (
              <div className="mt-xxs flex items-center gap-xs text-sm text-ink-muted">
                <span className="text-base">⭐</span>
                <span>
                  {activity.rating?.toFixed(1)} ({activity.rating_count ?? 0} reviews)
                </span>
              </div>
            )}
          </div>
          {savePayload ? (
            <SaveToggleButton payload={savePayload} size="md" className="self-start" />
          ) : null}
        </div>

        <div className="rounded-2xl border border-midnight-border/30 bg-surface-alt/70 p-xl">
          <h2 className="text-xl font-semibold text-ink">Upcoming availability</h2>
          {upcomingSessions.length === 0 ? (
            <p className="mt-xs text-sm text-ink-medium">No scheduled sessions yet. Check back soon!</p>
          ) : (
            <div className="mt-md space-y-md">
              {upcomingSessions.map((session) => {
                const { timing, venueLabel, priceLabel } = describeSession(session);
                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-sm rounded-2xl bg-surface/90 p-lg shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-base font-semibold text-ink">{timing}</p>
                      <p className="text-sm text-ink-muted">📍 {venueLabel}</p>
                      {session.description && (
                        <p className="mt-xs text-sm text-ink-medium">{session.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-sm sm:items-end">
                      <div className="flex flex-wrap items-center gap-sm">
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-sm py-xxs text-sm font-semibold text-emerald-700">
                          {priceLabel}
                        </span>
                        {session.id && (
                          <Link
                            href={{ pathname: `/sessions/${session.id}` }}
                            className="inline-flex items-center rounded-full border border-transparent px-md py-xs text-sm font-semibold text-emerald-600 transition hover:border-emerald-200 hover:bg-emerald-50"
                          >
                            View session →
                          </Link>
                        )}
                      </div>
                      {session.id && (
                        <>
                          <SessionAttendanceList
                            sessionId={session.id}
                            className="justify-end"
                          />
                          <SessionAttendanceQuickActions
                            sessionId={session.id}
                            size="compact"
                            className="sm:self-end"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {activity.tags?.length ? (
          <div className="flex flex-wrap gap-xs">
            {activity.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-emerald-50 px-sm py-xxs text-xs font-semibold uppercase tracking-wide text-emerald-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
