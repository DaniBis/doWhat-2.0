import RsvpBox from "@/components/RsvpBox";
import { createClient } from "@/lib/supabase/server";

interface SessionDetailRow {
  id: string;
  activity_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activities?: { name?: string | null } | null;
  venues?: { name?: string | null; lat?: number | null; lng?: number | null } | null;
}

export default async function ActivityDetails({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, activity_id, starts_at, ends_at, price_cents, activities(name), venues(name,lat,lng)")
    .eq("id", params.id)
    .single();

  if (!data) return <div className="p-8">Not found.</div>;

  const session = data as SessionDetailRow;
  const activityName = session.activities?.name ?? "Activity";
  const activityId = session.activity_id || params.id;
  const venueLat = session.venues?.lat ?? null;
  const venueLng = session.venues?.lng ?? null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="text-2xl font-semibold">{activityName}</h1>
      {/* RSVP */}
    <RsvpBox activityId={activityId} />
    {venueLat != null && venueLng != null && (
        <a
          className="mt-4 inline-block text-brand-teal"
      href={`https://www.google.com/maps/search/?api=1&query=${venueLat},${venueLng}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Maps
        </a>
      )}
    </main>
  );
}
