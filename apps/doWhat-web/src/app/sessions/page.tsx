import { createClient } from '@/lib/supabase/server';

interface SessionListRow {
  id: string;
  name: string | null;
  venue: { name?: string | null } | { name?: string | null }[] | null;
  starts_at: string | null;
  ends_at: string | null;
}

export default async function SessionsPage() {
  const supabase = createClient();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id,name,venue:venue_id(name),starts_at,ends_at')
    .order('starts_at', { ascending: true });

  if (error) return <div>Error loading sessions: {error.message}</div>;

  return (
    <main>
      <h1>Sessions</h1>
      <ul>
        {sessions?.map((raw) => {
          const s = raw as SessionListRow;
          const venueName = Array.isArray(s.venue) ? s.venue[0]?.name : s.venue?.name;
          return (
            <li key={s.id}>
              <strong>{s.name}</strong>
              {venueName && <> @ {venueName}</>}
              <br />
              {s.starts_at} – {s.ends_at}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
