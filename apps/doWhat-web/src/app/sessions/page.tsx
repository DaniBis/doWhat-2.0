import { createClient } from '@/lib/supabase/server';

interface SessionListRow {
  id: string;
  activities: { name?: string | null } | { name?: string | null }[] | null;
  venues: { name?: string | null } | { name?: string | null }[] | null;
  starts_at: string | null;
  ends_at: string | null;
}

export default async function SessionsPage() {
  const supabase = createClient();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id,starts_at,ends_at,activities(name),venues(name)')
    .order('starts_at', { ascending: true });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-ink">Sessions</h1>
        <div className="mt-4 rounded-lg border border-feedback-danger/30 bg-feedback-danger/5 p-4 text-sm text-feedback-danger">
          We could not load sessions right now. Please try again in a moment.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-ink">Sessions</h1>
      {!sessions?.length && (
        <div className="mt-4 rounded-lg border border-dashed border-midnight-border/50 p-4 text-sm text-ink-muted">
          No sessions are scheduled yet.
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {sessions?.map((raw) => {
          const s = raw as SessionListRow;
          const activityName = Array.isArray(s.activities) ? s.activities[0]?.name : s.activities?.name;
          const venueName = Array.isArray(s.venues) ? s.venues[0]?.name : s.venues?.name;
          return (
            <li key={s.id} className="rounded-lg border border-midnight-border/30 bg-white p-4 shadow-sm">
              <strong className="text-ink">{activityName ?? 'Community session'}</strong>
              {venueName && <span className="text-ink-muted"> @ {venueName}</span>}
              <br />
              <span className="text-sm text-ink-muted">
                {s.starts_at ?? 'Time TBA'} - {s.ends_at ?? 'Time TBA'}
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
