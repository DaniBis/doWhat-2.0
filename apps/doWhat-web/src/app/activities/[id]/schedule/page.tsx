import { notFound } from "next/navigation";

import ActivityScheduleBoard, {
  type ScheduleActivity,
  type ScheduleSession,
} from "@/components/ActivityScheduleBoard";
import { createClient } from "@/lib/supabase/server";

export default async function ActivitySchedulePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("id,name,description,activity_types")
    .eq("id", params.id)
    .maybeSingle<ScheduleActivity>();

  if (activityError) {
    console.error("Failed to load activity schedule metadata", activityError);
  }

  if (!activity) {
    notFound();
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(
  "id,starts_at,ends_at,price_cents,description,venue_id,venues(id,name,lat:lat,lng:lng)"
    )
    .eq("activity_id", params.id)
    .order("starts_at", { ascending: true })
    .returns<ScheduleSession[]>();

  if (sessionsError) {
    console.error("Failed to load activity schedule sessions", sessionsError);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <ActivityScheduleBoard
        activity={activity}
        sessions={sessions ?? []}
      />
    </div>
  );
}
