import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata, Route } from 'next';

import { formatEventTimeRange, inferEventLocationKind, inferEventOriginKind, type EventSummary } from '@dowhat/shared';
import {
  clampReliabilityScore,
  describeEventOrigin,
  describeEventState,
  describeEventVerification,
  describeReliabilityConfidence,
  eventPlaceLabel,
  eventStateClass,
  eventVerificationClass,
  reliabilityBarClass,
  buildEventVerificationProgress,
  formatReliabilityLabel,
} from '@/lib/events/presentation';

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

const getBaseUrl = () => {
  const hdrs = headers();
  const protocol = hdrs.get('x-forwarded-proto') ?? 'http';
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  if (!host) {
    throw new Error('Unable to determine base URL');
  }
  return `${protocol}://${host}`;
};

const fetchEvent = async (id: string): Promise<EventSummary> => {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/events/${id}`, {
    cache: 'no-store',
  });
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`Failed to load event (${response.status})`);
  }
  const payload = (await response.json()) as { event?: EventSummary };
  if (!payload.event) {
    notFound();
  }
  return payload.event;
};

interface EventPageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  try {
    const event = await fetchEvent(params.id);
    const { start } = formatEventTimeRange(event);
    return {
      title: `${event.title} – doWhat events`,
      description: event.description ?? undefined,
      openGraph: {
        title: event.title,
        description: event.description ?? undefined,
        type: 'article',
        publishedTime: start.toISOString(),
        url: `${getBaseUrl()}/events/${event.id}`,
      },
    };
  } catch {
    return {
      title: 'Event – doWhat',
    };
  }
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const event = await fetchEvent(params.id);
  const { start, end } = formatEventTimeRange(event);

  const eventTags = event.tags && event.tags.length > 0 ? event.tags.slice(0, 6) : [];
  const eventOrigin = describeEventOrigin(event);
  const originKind = inferEventOriginKind(event);
  const locationKind = inferEventLocationKind(event);
  const startLabel = formatDateTime(start);
  const endLabel = end ? formatDateTime(end) : null;
  const venueLabel = eventPlaceLabel(event, { fallback: 'Location to be confirmed' });
  const sourceLink = (event.metadata && typeof event.metadata.sourceUrl === 'string')
    ? event.metadata.sourceUrl
    : event.url ?? null;
  const stateLabel = describeEventState(event.event_state);
  const stateClass = eventStateClass(event.event_state);
  const verificationLabel = describeEventVerification(event.status);
  const verificationClass = eventVerificationClass(event.status);
  const reliabilityScore = clampReliabilityScore(event.reliability_score);
  const reliabilityLabel = formatReliabilityLabel(reliabilityScore);
  const reliabilityClass = reliabilityBarClass(reliabilityScore);
  const reliabilityConfidence = describeReliabilityConfidence(reliabilityScore);
  const reliabilityBarWidth = reliabilityScore == null ? 12 : reliabilityScore;
  const verificationProgress = buildEventVerificationProgress(event);
  const legacyVenueId =
    event.metadata && typeof event.metadata.venueId === 'string' && event.metadata.venueId.trim()
      ? event.metadata.venueId.trim()
      : null;

  const createActivityHref = event.place_id
    ? `/create?placeId=${encodeURIComponent(event.place_id)}`
    : legacyVenueId
      ? `/create?venueId=${encodeURIComponent(legacyVenueId)}`
      : '/create';
  const creationCtaLabel = event.place_id || legacyVenueId ? 'Start a session near this location' : 'Start a session';
  const sessionDetailHref =
    originKind === 'session' && event.url?.startsWith('/sessions/')
      ? (event.url as Route)
      : null;
  const truthSummary =
    originKind === 'session'
      ? 'Attendance and host actions live on the original doWhat session page.'
      : sourceLink
        ? 'Imported events keep their source-page RSVP and attendance flows.'
        : 'This listing does not expose an in-app attendance flow.';
  const locationSummary =
    locationKind === 'canonical_place'
      ? 'This listing is pinned to a canonical doWhat place.'
      : locationKind === 'legacy_venue'
        ? 'This listing still relies on a legacy venue record.'
        : locationKind === 'custom_location'
          ? 'This listing uses organizer-supplied location details.'
          : 'This listing does not have a pinned venue yet.';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:py-16">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/map" className="hover:text-emerald-600">Map</Link>
        <span aria-hidden>›</span>
        <span>{event.title}</span>
      </nav>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eventOrigin.label}</p>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${stateClass}`}>
            {stateLabel}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{event.title}</h1>
          <p className="text-sm text-slate-500">{eventOrigin.helper}</p>
          <p className="text-sm text-slate-500">
            {startLabel}
            {endLabel ? ` – ${endLabel}` : ''}
          </p>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <span role="img" aria-hidden>📍</span>
            <span>{venueLabel}</span>
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full border px-2 py-0.5 ${verificationClass}`}>
              {verificationLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
              {reliabilityConfidence}
            </span>
          </div>
          {eventTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {eventTags.map((tag) => (
                <span key={tag} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 md:w-72">
          <Link
            href={createActivityHref as Route}
            className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
          >
            {creationCtaLabel}
          </Link>
          {sourceLink && (
            <a
              href={sourceLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
            >
              Open source event page
            </a>
          )}
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">About this event</h2>
          {event.description ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</p>
          ) : (
            <p className="text-sm text-slate-500">No description provided.</p>
          )}
        </article>

        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 shadow-sm">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h3>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="text-xs text-slate-500">Starts</dt>
                <dd className="font-medium text-slate-900">{startLabel}</dd>
              </div>
              {endLabel && (
                <div>
                  <dt className="text-xs text-slate-500">Ends</dt>
                  <dd className="font-medium text-slate-900">{endLabel}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Status</dt>
                <dd className="font-medium text-slate-900">{stateLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Verification</dt>
                <dd>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${verificationClass}`}>
                    {verificationLabel}
                  </span>
                </dd>
              </div>
              {verificationProgress && (
                <div>
                  <dt className="text-xs text-slate-500">Community confirmations</dt>
                  <dd className="mt-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {verificationProgress.confirmations}/{verificationProgress.required} complete
                      </span>
                      <span className="font-semibold text-slate-900">{verificationProgress.percent}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${verificationProgress.complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${verificationProgress.percent}%` }}
                      />
                    </div>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Reliability</dt>
                <dd className="mt-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{reliabilityConfidence}</span>
                    <span className="font-semibold text-slate-900">{reliabilityLabel}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${reliabilityClass}`} style={{ width: `${reliabilityBarWidth}%` }} />
                  </div>
                </dd>
              </div>
              {event.place?.name && (
                <div>
                  <dt className="text-xs text-slate-500">Venue</dt>
                  <dd className="font-medium text-slate-900">{event.place.name}</dd>
                </div>
              )}
            </dl>
          </div>
          {sourceLink && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</h3>
              <p className="mt-2 break-words text-xs text-slate-500">
                <a href={sourceLink} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-700">
                  {sourceLink}
                </a>
              </p>
            </div>
          )}
        </aside>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Attendance truth</h2>
          <p className="mt-2 text-sm text-slate-600">{truthSummary}</p>
          {sessionDetailHref ? (
            <Link href={sessionDetailHref} className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Open session details →
            </Link>
          ) : sourceLink ? (
            <a href={sourceLink} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Open source page →
            </a>
          ) : null}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Location truth</h2>
          <p className="mt-2 text-sm text-slate-600">{locationSummary}</p>
          <p className="mt-3 text-sm text-slate-500">{venueLabel}</p>
        </section>
      </div>
    </div>
  );
}
