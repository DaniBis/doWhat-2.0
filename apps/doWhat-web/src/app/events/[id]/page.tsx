import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata, Route } from 'next';

import { formatEventTimeRange, type EventSummary } from '@dowhat/shared';

const humaniseStatus = (status: EventSummary['status']) =>
  status === 'canceled' ? 'Cancelled' : 'Scheduled';

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
  const startLabel = formatDateTime(start);
  const endLabel = end ? formatDateTime(end) : null;
  const venueLabel = event.venue_name ?? event.address ?? 'Venue TBC';
  const sourceLink = (event.metadata && typeof event.metadata.sourceUrl === 'string')
    ? event.metadata.sourceUrl
    : event.url ?? null;

  const createActivityHref = event.place_id
    ? `/create?placeId=${encodeURIComponent(event.place_id)}`
    : '/create';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:py-16">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/map" className="hover:text-emerald-600">Map</Link>
        <span aria-hidden>›</span>
        <span>{event.title}</span>
      </nav>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {humaniseStatus(event.status)}
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{event.title}</h1>
          <p className="text-sm text-slate-500">
            {startLabel}
            {endLabel ? ` – ${endLabel}` : ''}
          </p>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <span role="img" aria-hidden>📍</span>
            <span>{venueLabel}</span>
          </p>
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
            Create activity at this venue
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
                <dd className="font-medium text-slate-900">{humaniseStatus(event.status)}</dd>
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
    </div>
  );
}
