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
  host_user_id?: string | null;
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
    currentUserId && sortedSessions.some((session) => session.host_user_id && session.host_user_id === currentUserId)
  );

  const sessionHref = primary?.id ? { pathname: `/sessions/${primary.id}` } : null;
  const activityHref = activityId ? { pathname: `/activities/${activityId}` } : null;
  const titleHref = sessionHref ?? activityHref;

  return (
    <div className="flex h-full flex-col justify-between gap-lg rounded-2xl border border-midnight-border/30 bg-surface/80 p-xl shadow-sm ring-1 ring-gray-50 transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex flex-col gap-lg">
        <div className="flex items-start justify-between gap-md">
          <div className="flex items-center gap-sm">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
              <WebActivityIcon name={title} size={26} color="currentColor" />
            </span>
            <div>
              {titleHref ? (
                <Link href={titleHref} className="text-lg font-semibold text-ink transition hover:text-brand-teal">
                  {title}
                </Link>
              ) : (
                <span className="text-lg font-semibold text-ink">{title}</span>
              )}
              {purpose && <p className="mt-xxs max-w-md text-sm text-ink-medium">{purpose}</p>}
              {isHostedByUser && (
                <span className="mt-xs inline-flex items-center gap-xxs rounded-full bg-brand-teal/10 px-2.5 py-hairline text-xs font-semibold text-brand-dark">
                  🏠 Hosted by you
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-xs text-right">
            {primary && (
              <span className="inline-flex items-center rounded-full bg-brand-teal/15 px-sm py-xxs text-sm font-semibold text-brand-teal">
                {toPriceLabel(primary.price_cents)}
              </span>
            )}
            <SaveToggleButton payload={savePayload} className="self-end" />
          </div>
        </div>

        {primary && (
          <div className="rounded-xl bg-surface-alt px-md py-md text-sm text-ink-strong">
            <div className="flex flex-col gap-sm">
              <div className="flex flex-col gap-xxs">
                <div className="font-medium text-ink">🕒 {windowLabel}</div>
                {venueLabel && <div>📍 {venueLabel}</div>}
              </div>

              {primary.id && (
                <>
                  <SessionAttendanceList sessionId={primary.id} className="mt-xxs" />
                  <SessionAttendanceQuickActions sessionId={primary.id} className="mt-xxs" />
                </>
              )}
            </div>
          </div>
        )}

        {extras.length > 0 && (
          <div className="space-y-xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">More upcoming slots</p>
            <ul className="space-y-xs">
              {extras.map((session) => {
                const start = session.starts_at ? new Date(session.starts_at) : null;
                const end = session.ends_at ? new Date(session.ends_at) : null;
                const timing = start ? `${format(start, "EEE, MMM d • p")}${end ? ` → ${format(end, "p")}` : ""}` : "Schedule tbd";
                return (
                  <li
                    key={session.id ?? timing}
                    className="flex flex-col gap-sm rounded-xl border border-midnight-border/30 bg-surface px-md py-sm text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-xxs">
                      <span className="font-medium text-ink">{timing}</span>
                      <span className="text-ink-muted">{toVenueName(session.venues)}</span>
                    </div>
                    <div className="flex flex-col items-start gap-xs sm:items-end">
                      <div className="flex flex-wrap items-center gap-sm">
                        <span className="rounded-full bg-brand-teal/10 px-sm py-xxs text-xs font-semibold text-brand-teal">
                          {toPriceLabel(session.price_cents)}
                        </span>
                        {session.id && (
                          <Link
                            href={{ pathname: `/sessions/${session.id}` }}
                            className="text-xs font-semibold text-brand-teal transition hover:text-brand-dark"
                          >
                            Session details
                          </Link>
                        )}
                        {(session.venue_id ?? toVenueId(session.venues)) && (
                          <Link
                            href={{ pathname: `/venues/${session.venue_id ?? toVenueId(session.venues)}/schedule` }}
                            className="text-xs font-semibold text-brand-teal transition hover:text-brand-dark"
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

      <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-end">
        {activityId ? (
          <Link
            href={{ pathname: `/activities/${activityId}` }}
            className="inline-flex items-center justify-center gap-xs rounded-full bg-brand-teal px-md py-xs text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Activity details →
          </Link>
        ) : null}
        {primaryVenueId ? (
          <Link
            href={{ pathname: `/venues/${primaryVenueId}/schedule` }}
            className="inline-flex items-center justify-center gap-xs rounded-full border border-brand-teal/30 px-md py-xs text-sm font-semibold text-brand-teal transition hover:border-brand-teal hover:bg-brand-teal/10"
          >
            Venue schedule →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
