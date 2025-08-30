import { createClient } from "@/lib/supabase/server";
import ActivityCard from "@/components/ActivityCard";

export default async function HomePage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, price_cents, starts_at, ends_at, activities(name), venues(name)")
    .order("starts_at", { ascending: true })
    .limit(20);

  if (error) {
    return <pre>Error: {error.message}</pre>;
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return <p className="p-4 opacity-70">No sessions yet.</p>;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <ActivityCard key={s.id} s={s} />
        ))}
      </div>
    </main>
  );
}
