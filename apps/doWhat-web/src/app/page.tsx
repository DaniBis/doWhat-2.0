import Link from 'next/link';

import ActivityCard from '@/components/ActivityCard';
import { enforceServerCoreAccess } from '@/lib/access/serverGuard';
import { buildHomeCards, friendlyCategoryLabel, normalizeCategoryId, type HomeSessionRow } from '@/lib/home/filtering';

type SearchParams = { [k: string]: string | string[] | undefined };

const HOME_QUERY_LIMIT = 500;
const HOME_RECENT_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const DEFAULT_HOME_RADIUS_KM = 25;
const RELIABILITY_OPTIONS = [0, 50, 70, 85] as const;
const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;

const toSearchString = (searchParams?: SearchParams): string => {
  if (!searchParams) return '';
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, rawValue]) => {
    if (Array.isArray(rawValue)) {
      rawValue.forEach((entry) => {
        if (typeof entry === 'string') {
          params.append(key, entry);
        }
      });
      return;
    }
    if (typeof rawValue === 'string') {
      params.set(key, rawValue);
    }
  });
  return params.toString();
};

const readQueryValue = (value: string | string[] | undefined): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? '';
  return '';
};

const parseNumberQuery = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const redirectSearch = toSearchString(searchParams);
  const redirectTarget = redirectSearch ? `/?${redirectSearch}` : '/';
  const { supabase, user } = await enforceServerCoreAccess(redirectTarget);

  const searchInput = readQueryValue(searchParams?.q);
  const searchQuery = searchInput.trim().toLowerCase();
  const typesCsv = readQueryValue(searchParams?.types);
  const rawFilterTypes = typesCsv.split(',').map((value) => value.trim()).filter(Boolean);
  const normalizedFilterTypes = Array.from(
    new Set(
      rawFilterTypes
        .map((value) => normalizeCategoryId(value) ?? value.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const priceMin = Math.max(0, parseNumberQuery(readQueryValue(searchParams?.price_min), 0));
  const priceMax = Math.max(priceMin, parseNumberQuery(readQueryValue(searchParams?.price_max), 100));
  const radiusKm = Math.max(2, Math.min(100, parseNumberQuery(readQueryValue(searchParams?.radius_km), DEFAULT_HOME_RADIUS_KM)));
  const minReliability = Math.max(0, Math.min(100, Math.round(parseNumberQuery(readQueryValue(searchParams?.min_reliability), 0))));
  const hostSelfOnly = readQueryValue(searchParams?.host_self) === '1';

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('last_lat,last_lng')
    .eq('id', user.id)
    .maybeSingle<{ last_lat: number | null; last_lng: number | null }>();

  const userLat = typeof profileRow?.last_lat === 'number' ? profileRow.last_lat : null;
  const userLng = typeof profileRow?.last_lng === 'number' ? profileRow.last_lng : null;

  let query = supabase
    .from('sessions')
    .select(
      'id, host_user_id, price_cents, starts_at, ends_at, venue_id, reliability_score, '
      + 'activities!inner(id,name,description,activity_types,tags), '
      + 'venues(id,name,lat:lat,lng:lng)',
    )
    .order('starts_at', { ascending: true })
    .limit(HOME_QUERY_LIMIT);

  const lookbackIso = new Date(Date.now() - HOME_RECENT_LOOKBACK_MS).toISOString();
  const nowIso = new Date().toISOString();
  query = query.or(`starts_at.gte.${lookbackIso},ends_at.gte.${nowIso},created_at.gte.${lookbackIso}`);

  if (priceMin > 0) query = query.gte('price_cents', Math.round(priceMin * 100));
  if (priceMax < 100) query = query.lte('price_cents', Math.round(priceMax * 100));

  const { data, error } = await query;
  if (error) {
    return <pre>Error: {error.message}</pre>;
  }

  const rows: HomeSessionRow[] = Array.isArray(data) ? (data as unknown as HomeSessionRow[]) : [];
  const cards = buildHomeCards({
    rows,
    userId: user.id,
    searchQuery,
    normalizedFilterTypes,
    minReliability,
    hostSelfOnly,
    userLat,
    userLng,
    radiusKm,
    limit: 20,
  });

  const hasActiveFilters = Boolean(
    searchQuery
      || normalizedFilterTypes.length
      || priceMin > 0
      || priceMax < 100
      || minReliability > 0
      || hostSelfOnly
      || radiusKm !== DEFAULT_HOME_RADIUS_KM,
  );

  const activeFilterLabels = [
    ...(searchQuery ? [`Search: ${searchInput.trim()}`] : []),
    ...(normalizedFilterTypes.length ? [`Types: ${normalizedFilterTypes.map((value) => friendlyCategoryLabel(value)).join(', ')}`] : []),
    ...(priceMin > 0 || priceMax < 100 ? [`Price: ${priceMin} - ${priceMax}`] : []),
    ...(minReliability > 0 ? [`Reliability >= ${minReliability}`] : []),
    ...(hostSelfOnly ? ['Hosted by you'] : []),
    ...(radiusKm !== DEFAULT_HOME_RADIUS_KM ? [`Radius: ${radiusKm} km`] : []),
  ];

  const emptyHeading = hasActiveFilters ? 'No activities match your filters yet' : 'No sessions nearby yet';
  const emptyBody = hasActiveFilters
    ? 'Try broadening radius, reducing reliability threshold, or clearing category filters.'
    : 'Be the first to start a session in your area.';

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-10">
        <section className="relative overflow-hidden glass-panel p-8">
          <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-brand-teal/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-brand-yellow/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <span className="pill-chip">Live nearby</span>
              <div className="space-y-3">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Upcoming Activities</h1>
                <p className="text-lg text-ink-medium">
                  Real sessions from the database, scoped to your area and current filters.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/create" className="btn-primary">
                  Create a session
                </Link>
                <Link href="/map" className="btn-outline">
                  Open map
                </Link>
                <Link href="/venues" className="btn-outline">
                  Verify venues
                </Link>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1">
                  {cards.length} active activity{cards.length === 1 ? '' : 'ies'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1">
                  Radius {radiusKm} km
                </span>
              </div>
            </div>

            <div className="soft-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-teal">Discovery quality</p>
              <h3 className="mt-3 text-lg font-semibold text-ink-strong">No fake items, only persisted inventory</h3>
              <p className="mt-2 text-sm text-ink-medium">
                Suggestions are provider-backed and ranked with trust scoring. If nothing matches, you see why and what to do next.
              </p>
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-xs text-ink-medium">
                Tip: keep location enabled so area filters stay accurate.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 soft-card p-6">
          <form action="/" method="get" className="space-y-5">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Activities &amp; session filters</h2>
                  <p className="text-xs text-ink-muted">Search by activity, place, category, distance, and price.</p>
                </div>
                <label className="block text-sm text-ink-medium">
                  Search
                  <input
                    type="search"
                    name="q"
                    defaultValue={searchInput}
                    placeholder="Try chess, running, climbing"
                    className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                  />
                </label>
                <label className="block text-sm text-ink-medium">
                  Activity categories (comma-separated)
                  <input
                    type="text"
                    name="types"
                    defaultValue={typesCsv}
                    placeholder="fitness, community, climbing"
                    className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm text-ink-medium">
                    Radius
                    <select
                      name="radius_km"
                      defaultValue={String(radiusKm)}
                      className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                    >
                      {RADIUS_OPTIONS.map((option) => (
                        <option key={option} value={String(option)}>{option} km</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-ink-medium">
                    Min price
                    <input
                      type="number"
                      name="price_min"
                      min={0}
                      max={100}
                      defaultValue={String(priceMin)}
                      className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm text-ink-medium">
                    Max price
                    <input
                      type="number"
                      name="price_max"
                      min={0}
                      max={100}
                      defaultValue={String(priceMax)}
                      className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">People filters</h2>
                  <p className="text-xs text-ink-muted">Control host reliability and whether to only show your hosted sessions.</p>
                </div>
                <label className="block text-sm text-ink-medium">
                  Minimum host reliability
                  <select
                    name="min_reliability"
                    defaultValue={String(minReliability)}
                    className="mt-1 w-full rounded-xl border border-midnight-border/40 bg-white px-3 py-2 text-sm text-ink focus:border-brand-teal focus:outline-none"
                  >
                    {RELIABILITY_OPTIONS.map((option) => (
                      <option key={option} value={String(option)}>
                        {option === 0 ? 'Any reliability' : `${option}+`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-ink-medium">
                  <input
                    type="checkbox"
                    name="host_self"
                    value="1"
                    defaultChecked={hostSelfOnly}
                    className="h-4 w-4 rounded border-midnight-border/50 text-brand-teal focus:ring-brand-teal"
                  />
                  Show only sessions hosted by me
                </label>
                <p className="rounded-xl border border-midnight-border/30 bg-surface-alt px-3 py-2 text-xs text-ink-muted">
                  People filters are reusable contracts for mobile and web map feeds.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary">Apply filters</button>
              <Link href="/" className="btn-outline">Clear filters</Link>
              <Link href="/map" className="btn-outline">Open map view</Link>
            </div>

            {activeFilterLabels.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="font-semibold uppercase tracking-wide text-ink">Active</span>
                {activeFilterLabels.map((label) => (
                  <span key={label} className="inline-flex items-center rounded-full border border-midnight-border/30 bg-white px-2 py-1">
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </form>
        </section>

        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-ink-strong">Upcoming feed</h2>
              <p className="text-sm text-ink-medium">All sessions scheduled near you in the next few days.</p>
            </div>
            <div className="text-xs text-ink-muted">
              Showing {cards.length} activity{cards.length === 1 ? '' : 'ies'}
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="soft-card py-16 text-center">
              <div className="text-5xl">🎯</div>
              <h3 className="mt-4 text-xl font-semibold text-ink-strong">{emptyHeading}</h3>
              <p className="mt-2 text-sm text-ink-medium">{emptyBody}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {hasActiveFilters ? (
                  <Link href="/" className="btn-outline">
                    Clear filters
                  </Link>
                ) : null}
                <Link href="/create" className="btn-primary">
                  Create session
                </Link>
                <Link href="/map" className="btn-outline">
                  Check map area
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((group) => {
                const key =
                  group.activity.id
                  ?? group.activity.name
                  ?? group.sessions[0]?.id
                  ?? `${group.sessions[0]?.starts_at ?? 'group'}`;
                return (
                  <ActivityCard
                    key={key}
                    activity={group.activity}
                    sessions={group.sessions}
                    currentUserId={user.id}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
