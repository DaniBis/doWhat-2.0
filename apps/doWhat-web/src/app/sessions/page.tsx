import { createClient } from '@/lib/supabase/server';

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
        {sessions?.map((s: any) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            {s.venue?.name && <> @ {s.venue.name}</>}
            <br />
            {s.starts_at} – {s.ends_at}
          </li>
        ))}
      </ul>
    </main>
  );
}
