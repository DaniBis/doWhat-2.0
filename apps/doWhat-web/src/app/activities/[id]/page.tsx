import { createClient } from '@/lib/supabase/server';

export default async function ActivityPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: activity } = await supabase
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .single();
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, starts_at, ends_at, price_cents')
    .eq('activity_id', params.id)
    .order('starts_at', { ascending: true });

  if (!activity) {
    return <div className="p-6">Activity not found.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">{activity.name}</h1>
      {activity.venue && <div className="text-gray-700">{activity.venue}</div>}
      {activity.rating != null && (
        <div className="mt-1 text-sm text-gray-600">⭐ {activity.rating} ({activity.rating_count ?? 0})</div>
      )}
      {activity.description && <p className="mt-4 whitespace-pre-line">{activity.description}</p>}
      {!!activity.lat && !!activity.lng && (
        <div className="mt-2 text-sm text-gray-600">{activity.lat.toFixed(5)}, {activity.lng.toFixed(5)}</div>
      )}

      <h2 className="mt-8 mb-2 text-xl font-semibold">Upcoming sessions</h2>
      {!sessions?.length && <div>No sessions yet.</div>}
      <ul className="space-y-2">
        {(sessions || []).map((s) => (
          <li key={s.id} className="rounded border p-3">
            <div>
              {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleString()}
            </div>
            {s.price_cents != null && (
              <div className="text-sm text-gray-700">{(s.price_cents / 100).toFixed(2)} USD</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

