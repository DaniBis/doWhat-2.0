import Link from "next/link";
import ActivityCard from "@/components/ActivityCard";
import { normalizeCategoryKey } from "@/lib/places/categories";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

const NearbyDiscoverList = dynamic(() => import("@/components/home/NearbyDiscoverList"), { ssr: false });

const CATEGORY_LABELS: Record<string, string> = {
  activity: "Activities",
  arts_culture: "Arts & Culture",
  coffee: "Coffee",
  community: "Social",
  education: "Learning",
  event_space: "Entertainment",
  fitness: "Fitness",
  food: "Food & Drink",
  kids: "Kids",
  nightlife: "Nightlife",
  outdoors: "Outdoor",
  shopping: "Shopping",
  spiritual: "Spiritual",
  wellness: "Wellness",
  workspace: "Workspace",
};

const toArray = (input: unknown): string[] => {
  if (Array.isArray(input)) return input.filter((value): value is string => typeof value === "string");
  if (typeof input === "string") return [input];
  return [];
};

const normalizeCategoryId = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = normalizeCategoryKey(value);
  if (normalized) return normalized;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/[\s]+/g, "_");
};

const friendlyCategoryLabel = (category: string): string => {
  const label = CATEGORY_LABELS[category];
  if (label) return label;
  const spaced = category.replace(/[_-]+/g, " ");
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
};

const gatherCategorySignals = (values: unknown): { canonical: Set<string>; display: Set<string> } => {
  const canonical = new Set<string>();
  const display = new Set<string>();
  toArray(values).forEach((entry) => {
    const id = normalizeCategoryId(entry);
    if (id) {
      canonical.add(id);
      display.add(friendlyCategoryLabel(id));
    } else if (typeof entry === "string" && entry.trim()) {
      display.add(entry.trim());
    }
  });
  return { canonical, display };
};

const analyseActivityCategories = (
  activity: {
    name?: string | null;
    activity_types?: unknown;
    tags?: unknown;
  },
  filters: string[],
) => {
  const fromTypes = gatherCategorySignals(activity.activity_types);
  const fromTags = gatherCategorySignals(activity.tags);
  const canonical = new Set<string>([...fromTypes.canonical, ...fromTags.canonical]);
  const display = new Set<string>([...fromTypes.display, ...fromTags.display]);
  const matchedFilters = new Set<string>();

  const name = activity.name?.toLowerCase() ?? "";
  filters.forEach((filter) => {
    const filterAlreadyPresent = canonical.has(filter);
    if (filterAlreadyPresent) {
      matchedFilters.add(filter);
      return;
    }
    const candidateTerms = new Set<string>([
      filter.replace(/_/g, " "),
      friendlyCategoryLabel(filter).toLowerCase(),
    ]);
    const hasTermInName = Array.from(candidateTerms).some((term) => term && name.includes(term));
    if (hasTermInName) {
      matchedFilters.add(filter);
    }
  });

  matchedFilters.forEach((filter) => {
    canonical.add(filter);
    display.add(friendlyCategoryLabel(filter));
  });

  const matches = filters.length === 0 || matchedFilters.size > 0;

  return { matches, canonical, display };
};

const HOME_QUERY_LIMIT = 80;

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const typesCsv = (typeof searchParams?.types === 'string'
    ? searchParams?.types
    : Array.isArray(searchParams?.types)
    ? searchParams?.types[0]
    : '') || '';
  const rawFilterTypes = typesCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const normalizedFilterTypes = Array.from(
    new Set(
      rawFilterTypes
        .map((value) => normalizeCategoryId(value) ?? value.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const priceMin = Number(typeof searchParams?.price_min === 'string' ? searchParams?.price_min : Array.isArray(searchParams?.price_min) ? searchParams?.price_min[0] : '0') || 0;
  const priceMax = Number(typeof searchParams?.price_max === 'string' ? searchParams?.price_max : Array.isArray(searchParams?.price_max) ? searchParams?.price_max[0] : '100') || 100;

  let query = supabase
    .from("sessions")
    .select(
      "id, created_by, price_cents, starts_at, ends_at, venue_id, " +
        "activities!inner(id,name,description,activity_types,tags), " +
        "venues(id,name,lat:lat,lng:lng)"
    )
    .order("starts_at", { ascending: true })
    .limit(HOME_QUERY_LIMIT);

  query = query.gte("starts_at", new Date().toISOString());

  if (priceMin > 0) query = query.gte('price_cents', Math.round(priceMin * 100));
  if (priceMax < 100) query = query.lte('price_cents', Math.round(priceMax * 100));

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
          tags?: string[] | null;
        }
      | Array<{
          id?: string;
          name?: string | null;
          description?: string | null;
          activity_types?: string[] | null;
          tags?: string[] | null;
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

  const rows: SessionRow[] = Array.isArray(data) ? (data as unknown as SessionRow[]) : [];

  type Group = {
    activity: {
      id?: string;
      name?: string | null;
      description?: string | null;
      activity_types?: string[] | null;
      tags?: string[] | null;
    };
    canonicalCategories: Set<string>;
    displayCategories: Set<string>;
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

    const analysis = analyseActivityCategories(
      {
        name: activityRel.name,
        activity_types: activityRel.activity_types,
        tags: activityRel.tags,
      },
      normalizedFilterTypes,
    );

    if (!analysis.matches) continue;

    const key = activityRel.id ?? activityRel.name ?? session.id;
    if (!grouped.has(key)) {
      const activityTags = toArray(activityRel.tags);
      grouped.set(key, {
        activity: {
          id: activityRel.id ?? undefined,
          name: activityRel.name ?? null,
          description: activityRel.description ?? null,
          activity_types: null,
          tags: activityTags.length ? activityTags : null,
        },
        canonicalCategories: new Set<string>(),
        displayCategories: new Set<string>(),
        sessions: [],
      });
    }

    const bucket = grouped.get(key)!;
    analysis.canonical.forEach((category) => bucket.canonicalCategories.add(category));
    analysis.display.forEach((label) => bucket.displayCategories.add(label));

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

  const cards = Array.from(grouped.values())
    .map((group) => {
      const activityTypes = group.displayCategories.size
        ? Array.from(group.displayCategories).sort((a, b) => a.localeCompare(b))
        : null;
      const firstStart = group.sessions.reduce((min, s) => {
        if (!s.starts_at) return min;
        const time = new Date(s.starts_at).getTime();
        return min == null || time < min ? time : min;
      }, null as number | null);
      return {
        activity: {
          ...group.activity,
          activity_types: activityTypes,
        },
        sessions: group.sessions,
        firstStart,
      };
    })
    .sort((a, b) => {
      if (a.firstStart == null && b.firstStart == null) return 0;
      if (a.firstStart == null) return 1;
      if (b.firstStart == null) return -1;
      return a.firstStart - b.firstStart;
    })
    .slice(0, 20)
    .map((entry) => {
      const { firstStart, ...rest } = entry;
      void firstStart;
      return rest;
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

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-100 bg-emerald-50/80 px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">New</p>
            <h3 className="text-xl font-semibold text-emerald-900">Verify where activities really happen</h3>
            <p className="text-sm text-emerald-700">
              Help confirm AI suggestions, upvote the best venues, and keep the discovery map accurate for everyone.
            </p>
          </div>
          <Link
            href="/venues"
            className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700"
          >
            Open verification hub →
          </Link>
        </div>

  {cards.length === 0 ? (
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
