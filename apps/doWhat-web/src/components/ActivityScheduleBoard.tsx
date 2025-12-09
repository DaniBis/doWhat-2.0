"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, isAfter, isBefore, parseISO } from "date-fns";

import { buildSessionSavePayload, type ActivityRow } from "@dowhat/shared";
import SessionAttendanceQuickActions from "./SessionAttendanceQuickActions";
import SessionAttendanceList from "./SessionAttendanceList";
import WebActivityIcon from "./WebActivityIcon";
import SaveToggleButton from "./SaveToggleButton";

export type ScheduleActivity = {
  id: string;
  name: string;
  description?: string | null;
  activity_types?: string[] | null;
};

type VenueRef = {
  id?: string | null;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type ScheduleSession = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  price_cents: number | null;
  description?: string | null;
  venue_id?: string | null;
  venues: VenueRef[] | VenueRef | null;
};

type Props = {
  activity: ScheduleActivity;
  sessions: ScheduleSession[];
  currentUserId?: string | null;
  showVenueScheduleLink?: boolean;
};

type WindowOption = "next7" | "next30" | "next90" | "all";
type DensityOption = "comfortable" | "compact";

type GroupedSessions = Array<{
  dateKey: string;
  label: string;
  items: ScheduleSession[];
}>;

const windowOptions: Array<{ value: WindowOption; label: string }> = [
  { value: "next7", label: "Next 7 days" },
  { value: "next30", label: "Next 30 days" },
  { value: "next90", label: "Next 90 days" },
  { value: "all", label: "All upcoming" },
];

const densityOptions: Array<{ value: DensityOption; label: string }> = [
  { value: "comfortable", label: "Comfort" },
  { value: "compact", label: "Compact" },
];

function toPriceLabel(price_cents: number | null) {
  if (price_cents == null) return "Free";
  const val = price_cents / 100;
  return val <= 0 ? "Free" : `€${val.toFixed(2)}`;
}

function toVenueMeta(session: ScheduleSession) {
  const fallback = {
    id: session.venue_id ?? null,
    name: "Flexible location",
    lat: null as number | null,
    lng: null as number | null,
  };
  if (!session.venues) {
    return fallback;
  }
  const record = Array.isArray(session.venues) ? session.venues[0] : session.venues;
  return {
    id: record?.id ?? fallback.id,
    name: record?.name ?? fallback.name,
    lat: record?.lat ?? fallback.lat,
    lng: record?.lng ?? fallback.lng,
  };
}

function applyWindowFilter(sessions: ScheduleSession[], windowFilter: WindowOption) {
  if (windowFilter === "all") {
    return sessions;
  }
  const now = new Date();
  const limit = new Date();
  if (windowFilter === "next7") {
    limit.setDate(limit.getDate() + 7);
  } else if (windowFilter === "next30") {
    limit.setDate(limit.getDate() + 30);
  } else if (windowFilter === "next90") {
    limit.setDate(limit.getDate() + 90);
  }

  return sessions.filter((session) => {
    const start = parseISO(session.starts_at);
    return isAfter(start, now) && isBefore(start, limit);
  });
}

function filterAndSortSessions(
  sessions: ScheduleSession[],
  windowFilter: WindowOption,
  searchTerm: string
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const windowed = applyWindowFilter(sessions, windowFilter);

  const filtered = normalizedSearch
    ? windowed.filter((session) => {
        const venue = toVenueMeta(session).name.toLowerCase();
        const description = session.description?.toLowerCase() ?? "";
        const startDateObj = parseISO(session.starts_at);
        const startDateString = Number.isNaN(startDateObj.getTime())
          ? session.starts_at.toLowerCase()
          : format(startDateObj, "EEEE MMM d, yyyy").toLowerCase();
        return (
          venue.includes(normalizedSearch) ||
          description.includes(normalizedSearch) ||
          startDateString.includes(normalizedSearch)
        );
      })
    : windowed;

  return filtered.sort(
    (a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );
}

function groupByDay(sessions: ScheduleSession[]): GroupedSessions {
  const groups = new Map<string, ScheduleSession[]>();

  sessions.forEach((session) => {
    const key = format(parseISO(session.starts_at), "yyyy-MM-dd");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(session);
  });

  return Array.from(groups.entries())
    .map(([dateKey, items]) => ({
      dateKey,
      label: format(parseISO(`${dateKey}T00:00:00`), "EEEE, MMMM d"),
      items: items.sort(
        (a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
      ),
    }))
    .sort((a, b) => parseISO(a.dateKey).getTime() - parseISO(b.dateKey).getTime());
}

function formatDuration(start: Date, end: Date | null) {
  if (!end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return null;
  const hours = diffMs / (1000 * 60 * 60);
  if (hours >= 1) return `${hours.toFixed(hours >= 3 ? 0 : 1)}h`;
  const minutes = diffMs / (1000 * 60);
  return `${minutes.toFixed(0)}min`;
}

function extractStats(sessions: ScheduleSession[]) {
  const now = new Date();
  const futureSessions = sessions.filter((session) => {
    const start = parseISO(session.starts_at);
    return isAfter(start, now);
  });

  const venueNames = new Set<string>();
  sessions.forEach((session) => {
    const venue = toVenueMeta(session).name;
    if (venue) venueNames.add(venue);
  });

  const sortedDates = futureSessions
    .map((session) => parseISO(session.starts_at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    totalUpcoming: futureSessions.length,
    venueCount: venueNames.size,
    earliest: sortedDates[0] ?? null,
    latest: sortedDates[sortedDates.length - 1] ?? null,
  };
}

export default function ActivityScheduleBoard({
  activity,
  sessions,
  currentUserId: _currentUserId,
  showVenueScheduleLink = true,
}: Props) {
  void _currentUserId;
  const [windowFilter, setWindowFilter] = useState<WindowOption>("next30");
  const [density, setDensity] = useState<DensityOption>("comfortable");
  const [searchTerm, setSearchTerm] = useState("");

  const groupedSessions = useMemo(
    () => groupByDay(filterAndSortSessions(sessions, windowFilter, searchTerm)),
    [sessions, windowFilter, searchTerm]
  );

  const stats = useMemo(() => extractStats(sessions), [sessions]);

  const { totalUpcoming, venueCount, earliest, latest } = stats;
  const dateRangeLabel =
    earliest && latest
      ? `${format(earliest, "MMM d")} – ${format(latest, "MMM d")}`
      : earliest
      ? `Starting ${format(earliest, "MMM d")}`
      : null;

  const sessionItemClasses =
    density === "compact"
      ? "flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      : "flex flex-col gap-4 rounded-3xl border border-gray-100 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between";

  return (
    <div className="flex flex-col gap-8">
      <header className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <WebActivityIcon name={activity.name} size={26} color="#92400e" />
          </span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl font-bold text-gray-900">{activity.name}</h1>
            {activity.description && (
              <p className="mt-1 text-sm text-gray-600 max-w-2xl">{activity.description}</p>
            )}
          </div>
          <dl className="flex flex-col items-start gap-1 text-sm text-gray-600 sm:items-end">
            <div className="flex items-center gap-2">
              <dt className="font-medium text-gray-500">Upcoming</dt>
              <dd className="font-semibold text-gray-900">{totalUpcoming}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="font-medium text-gray-500">Venues</dt>
              <dd className="font-semibold text-gray-900">{venueCount}</dd>
            </div>
            {dateRangeLabel && (
              <div className="flex items-center gap-2">
                <dt className="font-medium text-gray-500">Range</dt>
                <dd className="font-semibold text-gray-900">{dateRangeLabel}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm">
        <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1 text-sm font-medium text-gray-600">
          {windowOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWindowFilter(option.value)}
              className={`rounded-full px-3 py-1 transition ${
                windowFilter === option.value
                  ? "bg-emerald-500 text-white"
                  : "text-gray-600 hover:text-emerald-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1 text-sm font-medium text-gray-600">
          {densityOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDensity(option.value)}
              className={`rounded-full px-3 py-1 transition ${
                density === option.value
                  ? "bg-emerald-500 text-white"
                  : "text-gray-600 hover:text-emerald-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by venue, description, or date"
            className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <Link
          href={{ pathname: `/activities/${activity.id}` }}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-50"
        >
          Back to overview
        </Link>
      </div>

      <section className="space-y-6">
        {groupedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
            No sessions match your filters.
          </div>
        ) : (
          groupedSessions.map((group) => (
            <div key={group.dateKey} className="rounded-3xl border border-gray-100 bg-white shadow-sm">
              <header className="sticky top-16 z-10 flex items-center justify-between gap-4 border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
                <span className="text-sm text-gray-500">
                  {group.items.length} slot{group.items.length === 1 ? "" : "s"}
                </span>
              </header>
              <ul className="divide-y divide-gray-100">
                {group.items.map((session) => {
                  const start = parseISO(session.starts_at);
                  const end = session.ends_at ? parseISO(session.ends_at) : null;
                  const timeRange = `${format(start, "p")}${end ? ` → ${format(end, "p")}` : ""}`;
                  const duration = formatDuration(start, end);
                  const venue = toVenueMeta(session);
                  const priceLabel = toPriceLabel(session.price_cents);
                  const activityRow: ActivityRow = {
                    id: session.id,
                    price_cents: session.price_cents ?? null,
                    starts_at: session.starts_at ?? null,
                    ends_at: session.ends_at ?? null,
                    activities: {
                      id: activity.id,
                      name: activity.name,
                    },
                    venues: {
                      name: venue.name ?? null,
                    },
                  };
                  const baseSavePayload = buildSessionSavePayload(activityRow, {
                    source: "web_activity_schedule",
                  });
                  const savePayload = baseSavePayload
                    ? {
                        ...baseSavePayload,
                        venueId: venue.id ?? baseSavePayload.venueId,
                        address: baseSavePayload.address ?? venue.name ?? undefined,
                        metadata: {
                          ...(baseSavePayload.metadata ?? {}),
                          venueId: venue.id ?? null,
                          venueLat: venue.lat ?? null,
                          venueLng: venue.lng ?? null,
                        },
                      }
                    : null;

                  return (
                    <li key={session.id} className={sessionItemClasses}>
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                          {timeRange}
                        </div>
                        <div className="text-base font-semibold text-gray-900">{venue.name}</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                          <span>{priceLabel}</span>
                          {duration && <span>• Duration {duration}</span>}
                        </div>
                        {session.description && (
                          <p className="mt-1 text-sm text-gray-600 max-w-2xl">{session.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-3 sm:items-end">
                        {session.id ? (
                          <>
                            <SessionAttendanceList
                              sessionId={session.id}
                              className="justify-end"
                            />
                            <SessionAttendanceQuickActions
                              sessionId={session.id}
                              size={density === "compact" ? "compact" : "default"}
                              className="sm:self-end"
                            />
                          </>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-600">
                          {session.id ? (
                            <Link
                              href={{ pathname: `/sessions/${session.id}` }}
                              className="inline-flex items-center gap-2 transition hover:text-emerald-700"
                            >
                              Session details →
                            </Link>
                          ) : null}
                          {showVenueScheduleLink && venue.id && (
                            <Link
                              href={{ pathname: `/venues/${venue.id}/schedule` }}
                              className="inline-flex items-center gap-2 transition hover:text-emerald-700"
                            >
                              Venue schedule →
                            </Link>
                          )}
                          <SaveToggleButton payload={savePayload} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
