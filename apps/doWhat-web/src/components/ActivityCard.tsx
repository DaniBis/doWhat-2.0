import Link from "next/link";
import { format } from "date-fns";

import { buildActivitySavePayload, type ActivityRow } from "@dowhat/shared";
import WebActivityIcon from "./WebActivityIcon";
import SessionAttendanceQuickActions from "./SessionAttendanceQuickActions";
import SessionAttendanceList from "./SessionAttendanceList";
import SaveToggleButton from "./SaveToggleButton";

type Venue = {
  id?: string | null;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Session = {
  id?: string;
  created_by?: string | null;
  price_cents?: number | null;
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
  venue_id?: string | null;
  venues?: Venue | Venue[] | null;
};

type Activity = {
  id?: string;
  name?: string | null;
  description?: string | null;
  activity_types?: string[] | null;
};

type Props = {
  activity: Activity;
  sessions: Session[];
  currentUserId?: string | null;
};

function toVenueMeta(venues?: Venue | Venue[] | null) {
  if (!venues) {
    return { id: null as string | null, name: "Flexible location" };
  }
  const record = Array.isArray(venues) ? venues[0] : venues;
  return {
    id: record?.id ?? null,
    name: record?.name ?? "Flexible location",
  };
}

function toVenueName(venues?: Venue | Venue[] | null) {
  return toVenueMeta(venues).name;
}

function toVenueId(venues?: Venue | Venue[] | null) {
  return toVenueMeta(venues).id;
}

function toPriceLabel(priceCents?: number | null) {
  if (priceCents == null) return "Free";
  const price = priceCents / 100;
  return price <= 0 ? "Free" : `€${price.toFixed(2)}`;
}

export default function ActivityCard({ activity, sessions, currentUserId }: Props) {
  const activityId = activity.id ?? null;
  const title = activity.name ?? "Community activity";
  const purpose = activity.description ?? (activity.activity_types?.length ? activity.activity_types.join(", ") : null);

  const sortedSessions = [...sessions].sort((a, b) => {
    const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  const primary = sortedSessions[0];
  const extras = sortedSessions.slice(1, 3);

  const startsAt = primary?.starts_at ? new Date(primary.starts_at) : null;
  const endsAt = primary?.ends_at ? new Date(primary.ends_at) : null;
  const windowLabel = startsAt
    ? `${format(startsAt, "PPP • p")}${endsAt ? ` → ${format(endsAt, "p")}` : ""}`
    : "Schedule tbd";

  const primaryVenueMeta = primary ? toVenueMeta(primary.venues) : { id: null, name: "Flexible location" };
  const primaryVenueId = primary?.venue_id ?? primaryVenueMeta.id;
  const venueLabel = primary ? primaryVenueMeta.name : "Flexible location";

  const sessionRowsForSave: ActivityRow[] = sessions.map((session, index) => {
    const venueMeta = toVenueMeta(session.venues);
    const fallbackId = `${activityId ?? "activity"}-session-${index}`;
    return {
      id: session.id ?? fallbackId,
      price_cents: session.price_cents ?? null,
      starts_at: session.starts_at ?? null,
      ends_at: session.ends_at ?? null,
      activities: {
        id: activityId ?? undefined,
        name: title,
      },
      venues: {
        name: venueMeta.name ?? null,
      },
    } satisfies ActivityRow;
  });

  const baseActivityPayload = buildActivitySavePayload(
    { id: activityId ?? null, name: title },
    sessionRowsForSave,
    { source: "web_activity_card" },
  );

  const savePayload = baseActivityPayload
    ? {
        ...baseActivityPayload,
        venueId: primaryVenueId ?? baseActivityPayload.venueId,
        address: baseActivityPayload.address ?? venueLabel ?? undefined,
        metadata: {
          ...(baseActivityPayload.metadata ?? {}),
          primarySessionId: primary?.id ?? null,
        },
      }
    : null;

  const isHostedByUser = Boolean(
    currentUserId && sortedSessions.some((session) => session.created_by && session.created_by === currentUserId)
  );

  const sessionHref = primary?.id ? { pathname: `/sessions/${primary.id}` } : null;
  const activityHref = activityId ? { pathname: `/activities/${activityId}` } : null;
  const titleHref = sessionHref ?? activityHref;

  return (
    <div className="flex h-full flex-col justify-between gap-5 rounded-2xl border border-gray-100 bg-white/80 p-6 shadow-sm ring-1 ring-gray-50 transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <WebActivityIcon name={title} size={26} color="#92400e" />
            </span>
            <div>
              {titleHref ? (
                <Link href={titleHref} className="text-lg font-semibold text-gray-900 transition hover:text-emerald-600">
                  {title}
                </Link>
              ) : (
                <span className="text-lg font-semibold text-gray-900">{title}</span>
              )}
              {purpose && <p className="mt-1 max-w-md text-sm text-gray-600">{purpose}</p>}
              {isHostedByUser && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  🏠 Hosted by you
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            {primary && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                {toPriceLabel(primary.price_cents)}
              </span>
            )}
            <SaveToggleButton payload={savePayload} className="self-end" />
          </div>
        </div>

        {primary && (
          <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-700">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="font-medium text-gray-900">🕒 {windowLabel}</div>
                {venueLabel && <div>📍 {venueLabel}</div>}
              </div>

              {primary.id && (
                <>
                  <SessionAttendanceList sessionId={primary.id} className="mt-1" />
                  <SessionAttendanceQuickActions sessionId={primary.id} className="mt-1" />
                </>
              )}
            </div>
          </div>
        )}

        {extras.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">More upcoming slots</p>
            <ul className="space-y-2">
              {extras.map((session) => {
                const start = session.starts_at ? new Date(session.starts_at) : null;
                const end = session.ends_at ? new Date(session.ends_at) : null;
                const timing = start ? `${format(start, "EEE, MMM d • p")}${end ? ` → ${format(end, "p")}` : ""}` : "Schedule tbd";
                return (
                  <li
                    key={session.id ?? timing}
                    className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-gray-900">{timing}</span>
                      <span className="text-gray-500">{toVenueName(session.venues)}</span>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                          {toPriceLabel(session.price_cents)}
                        </span>
                        {session.id && (
                          <Link
                            href={{ pathname: `/sessions/${session.id}` }}
                            className="text-xs font-semibold text-emerald-600 transition hover:text-emerald-700"
                          >
                            Session details
                          </Link>
                        )}
                        {(session.venue_id ?? toVenueId(session.venues)) && (
                          <Link
                            href={{ pathname: `/venues/${session.venue_id ?? toVenueId(session.venues)}/schedule` }}
                            className="text-xs font-semibold text-emerald-600 transition hover:text-emerald-700"
                          >
                            Venue schedule
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
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {activityId ? (
          <Link
            href={{ pathname: `/activities/${activityId}` }}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Activity details →
          </Link>
        ) : null}
        {primaryVenueId ? (
          <Link
            href={{ pathname: `/venues/${primaryVenueId}/schedule` }}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-50"
          >
            Venue schedule →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
