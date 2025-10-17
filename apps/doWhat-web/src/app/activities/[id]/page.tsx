import Link from "next/link";
import { format } from "date-fns";

import RsvpBadges from "@/components/RsvpBadges";
import RsvpQuickActions from "@/components/RsvpQuickActions";
import SessionAttendanceList from "@/components/SessionAttendanceList";
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
    return <div className="p-6">Activity not found.</div>;
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, created_by, starts_at, ends_at, price_cents, description, venues(name, lat, lng)"
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

  const describeSession = (session: typeof upcomingSessions[number]) => {
    const start = session.starts_at ? new Date(session.starts_at) : null;
    const end = session.ends_at ? new Date(session.ends_at) : null;
    const venueRel = Array.isArray(session.venues) ? session.venues[0] : session.venues;
    const venueLabel = venueRel?.name ?? "Flexible location";
    const timing = start
      ? `${format(start, "EEEE, MMMM d")} • ${format(start, "p")}${end ? ` → ${format(end, "p")}` : ""}`
      : "Schedule tbd";
    const priceCents = session.price_cents ?? 0;
    const priceLabel = priceCents <= 0 ? "Free" : `€${(priceCents / 100).toFixed(2)}`;
    return { timing, venueLabel, priceLabel };
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-col gap-6 rounded-3xl border border-gray-100 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Activity</p>
          <h1 className="text-3xl font-bold text-gray-900">{activity.name}</h1>
          <p className="text-lg text-gray-700">{purpose}</p>
          {(activity.rating ?? null) != null && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="text-base">⭐</span>
              <span>
                {activity.rating?.toFixed(1)} ({activity.rating_count ?? 0} reviews)
              </span>
            </div>
          )}
        </div>

        <RsvpBadges activityId={activity.id} />

        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Upcoming availability</h2>
          {upcomingSessions.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No scheduled sessions yet. Check back soon!</p>
          ) : (
            <div className="mt-4 space-y-4">
              {upcomingSessions.map((session) => {
                const { timing, venueLabel, priceLabel } = describeSession(session);
                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-3 rounded-2xl bg-white/90 p-5 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-base font-semibold text-gray-900">{timing}</p>
                      <p className="text-sm text-gray-500">📍 {venueLabel}</p>
                      {session.description && (
                        <p className="mt-2 text-sm text-gray-600">{session.description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-3 sm:items-end">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                          {priceLabel}
                        </span>
                        {session.id && (
                          <Link
                            href={{ pathname: `/sessions/${session.id}` }}
                            className="inline-flex items-center rounded-full border border-transparent px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:border-emerald-200 hover:bg-emerald-50"
                          >
                            View session →
                          </Link>
                        )}
                      </div>
                      {session.id && (
                        <SessionAttendanceList
                          sessionId={session.id}
                          activityId={activity.id}
                          className="justify-end"
                        />
                      )}
                      <RsvpQuickActions
                        activityId={activity.id}
                        sessionId={session.id ?? null}
                        size="compact"
                        className="sm:self-end"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {activity.tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {activity.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700"
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
