import Link from "next/link";
import ActivityCard from "@/components/ActivityCard";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

const NearbyDiscoverList = dynamic(() => import("@/components/home/NearbyDiscoverList"), { ssr: false });

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const typesCsv = (typeof searchParams?.types === 'string' ? searchParams?.types : Array.isArray(searchParams?.types) ? searchParams?.types[0] : '') || '';
  const types = typesCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const priceMin = Number(typeof searchParams?.price_min === 'string' ? searchParams?.price_min : Array.isArray(searchParams?.price_min) ? searchParams?.price_min[0] : '0') || 0;
  const priceMax = Number(typeof searchParams?.price_max === 'string' ? searchParams?.price_max : Array.isArray(searchParams?.price_max) ? searchParams?.price_max[0] : '100') || 100;

  let query = supabase
    .from("sessions")
    .select(
  "id, created_by, price_cents, starts_at, ends_at, venue_id, activities!inner(id,name,description,activity_types), venues(id,name,lat:lat,lng:lng)"
    )
    .order("starts_at", { ascending: true })
    .limit(20);

  query = query.gte("starts_at", new Date().toISOString());

  if (priceMin > 0) query = query.gte('price_cents', Math.round(priceMin * 100));
  if (priceMax < 100) query = query.lte('price_cents', Math.round(priceMax * 100));
  if (types.length) {
    const ors = types.map((t) => `activities.name.ilike.%${t}%`).join(',');
    query = query.or(ors);
  }

  const { data, error } = await query;

  if (error) {
    return <pre>Error: {error.message}</pre>;
  }

  type SessionRow = {
    id: string;
    created_by?: string | null;
    price_cents?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    venue_id?: string | null;
    activities?:
      | {
          id?: string;
          name?: string | null;
          description?: string | null;
          activity_types?: string[] | null;
        }
      | Array<{
          id?: string;
          name?: string | null;
          description?: string | null;
          activity_types?: string[] | null;
        }>;
    venues?:
      | {
          id?: string | null;
          name?: string | null;
          lat?: number | null;
          lng?: number | null;
        }
      | Array<{
          id?: string | null;
          name?: string | null;
          lat?: number | null;
          lng?: number | null;
        }>;
  };

  const rows: SessionRow[] = (data ?? []) as SessionRow[];

  type Group = {
    activity: {
      id?: string;
      name?: string | null;
      description?: string | null;
      activity_types?: string[] | null;
    };
    sessions: Array<{
      id?: string;
      created_by?: string | null;
      price_cents?: number | null;
      starts_at?: string | null;
      ends_at?: string | null;
      venue_id?: string | null;
      venues?: VenueRef | VenueRef[] | null;
    }>;
  };

  type VenueRef = {
    id?: string | null;
    name?: string | null;
    lat?: number | null;
    lng?: number | null;
  };

  const grouped = new Map<string, Group>();

  for (const session of rows) {
    const activityRel = Array.isArray(session.activities)
      ? session.activities[0]
      : session.activities;
    if (!activityRel) continue;
    const key = activityRel.id ?? activityRel.name ?? session.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        activity: {
          id: activityRel.id ?? undefined,
          name: activityRel.name ?? null,
          description: activityRel.description ?? null,
          activity_types: activityRel.activity_types ?? null,
        },
        sessions: [],
      });
    }

    const bucket = grouped.get(key)!;
    bucket.sessions.push({
      id: session.id,
      created_by: session.created_by ?? null,
      price_cents: session.price_cents ?? null,
      starts_at: session.starts_at ?? null,
      ends_at: session.ends_at ?? null,
      venue_id: session.venue_id ?? null,
      venues: session.venues ?? null,
    });
  }

  const cards = Array.from(grouped.values()).sort((a, b) => {
    const aStart = a.sessions.reduce((min, s) => {
      if (!s.starts_at) return min;
      const time = new Date(s.starts_at).getTime();
      return min == null || time < min ? time : min;
    }, null as number | null);
    const bStart = b.sessions.reduce((min, s) => {
      if (!s.starts_at) return min;
      const time = new Date(s.starts_at).getTime();
      return min == null || time < min ? time : min;
    }, null as number | null);
    if (aStart == null && bStart == null) return 0;
    if (aStart == null) return 1;
    if (bStart == null) return -1;
    return aStart - bStart;
  });

  return (
    <main className="min-h-screen">
      {/* Upcoming Activities only */}
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Upcoming Activities</h2>
            <p className="text-gray-600">Created events and nearby results</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link 
              href="/filter?from=home" 
              className="inline-flex items-center gap-2 rounded-lg border border-purple-500 px-4 py-2 text-purple-500 hover:bg-purple-50 font-medium transition-colors"
            >
              ⚙️ Filters
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600 mb-6">Be the first to create an event in your area!</p>
            <Link 
              href="/create" 
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-white font-semibold hover:bg-emerald-600 transition-colors"
            >
              <span>✨</span>
              Create First Event
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((group) => {
              const key =
                group.activity.id ??
                group.activity.name ??
                group.sessions[0]?.id ??
                `${group.sessions[0]?.starts_at ?? "group"}`;
              return (
                <ActivityCard
                  key={key}
                  activity={group.activity}
                  sessions={group.sessions}
                  currentUserId={user?.id}
                />
              );
            })}
          </div>
        )}
        {/* Nearby discovered via API */}
        <div className="mt-12">
          <NearbyDiscoverList />
        </div>
      </div>
    </main>
  );
}
