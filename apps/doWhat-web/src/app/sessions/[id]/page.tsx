import { createClient } from "@/lib/supabase/server";
import RsvpBox from "@/components/RsvpBox";

export default async function ActivityDetails({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("activities_view")     // or your table/view
    .select("*")
    .eq("id", params.id)
    .single();

  if (!data) return <div className="p-8">Not found.</div>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{data.activities?.name ?? "Activity"}</h1>
      {/* RSVP */}
      <RsvpBox activityId={(data as any)?.activity_id ?? params.id} />
    </main>
  );
}
