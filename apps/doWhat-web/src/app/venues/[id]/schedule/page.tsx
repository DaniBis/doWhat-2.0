import ActivityScheduleBoard, {
  type ScheduleActivity,
  type ScheduleSession,
} from "@/components/ActivityScheduleBoard";
import { createClient } from "@/lib/supabase/server";

async function getVenueContext(supabase: ReturnType<typeof createClient>, venueId: string) {
  const [{ data: venue }, { data: sessions }] = await Promise.all([
    supabase
      .from("venues")
      .select("id, name, description")
      .eq("id", venueId)
      .maybeSingle<{ id: string; name: string; description?: string | null }>(),
    supabase
      .from("sessions")
      .select(
        "id, activity_id, starts_at, ends_at, price_cents, description, venue_id, activities(id, name, description, activity_types), venues(id, name, lat, lng)"
      )
      .eq("venue_id", venueId)
      .order("starts_at", { ascending: true })
      .returns<
        Array<
          ScheduleSession & {
            activity_id: string;
            activities: ScheduleActivity | ScheduleActivity[] | null;
          }
        >
      >(),
  ]);

  return { venue, sessions: sessions ?? [] };
}

function toActivityMap(rows: Array<ScheduleSession & { activity_id: string; activities: ScheduleActivity | ScheduleActivity[] | null }>) {
  const map = new Map<string, ScheduleActivity>();
  rows.forEach((row) => {
    const rel = Array.isArray(row.activities) ? row.activities[0] : row.activities;
    if (rel) {
      map.set(row.activity_id, rel);
    }
  });
  return map;
}

function normalizeSessions(rows: Array<ScheduleSession & { activity_id: string; activities: ScheduleActivity | ScheduleActivity[] | null }>) {
  return rows.map((row) => {
    const { activities, ...rest } = row;
    void activities;
    return rest satisfies ScheduleSession;
  });
}

export default async function VenueSchedulePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [userResult, venueResult] = await Promise.all([
    supabase.auth.getUser(),
    getVenueContext(supabase, params.id),
  ]);

  const currentUserId = userResult.data.user?.id ?? null;
  const { venue, sessions } = venueResult;

  if (!venue) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-600">
          Venue not found.
        </div>
      </main>
    );
  }

  if (sessions.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <header className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{venue.name}</h1>
          {venue.description && <p className="mt-1 text-sm text-gray-600 max-w-2xl">{venue.description}</p>}
        </header>
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-600">
          No sessions scheduled at this venue yet.
        </div>
      </main>
    );
  }

  const activityMap = toActivityMap(sessions);
  const pseudoActivity: ScheduleActivity = {
    id: venue.id,
    name: venue.name,
    description:
      venue.description ??
      (activityMap.size
        ? `Hosting ${activityMap.size} activit${activityMap.size === 1 ? "y" : "ies"}.`
        : "A flexible venue with upcoming community sessions."),
  };

  const enrichedSessions: ScheduleSession[] = normalizeSessions(sessions).map((session) => ({
    ...session,
    venues: session.venues ?? [{ id: venue.id, name: venue.name }],
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <ActivityScheduleBoard
        activity={pseudoActivity}
        sessions={enrichedSessions}
        currentUserId={currentUserId}
        showVenueScheduleLink={false}
      />
    </main>
  );
}
