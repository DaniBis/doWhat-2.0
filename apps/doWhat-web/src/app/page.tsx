import Link from "next/link";

import ActivityCard from "@/components/ActivityCard";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, price_cents, starts_at, ends_at, activities(id,name), venues(name)")
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
      <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-2xl font-bold">Discover Events</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/create" className="rounded-lg bg-brand-teal px-4 py-2 text-white hover:bg-teal-700 font-medium">
            + Create Event
          </Link>
          <Link href="/search" className="rounded-lg border border-brand-teal px-4 py-2 text-brand-teal hover:bg-teal-50 font-medium">
            🔍 Search
          </Link>
          <Link href="/discover" className="rounded-lg border border-brand-teal px-4 py-2 text-brand-teal hover:bg-teal-50 font-medium">
            ✨ Discover
          </Link>
          <Link href="/my/rsvps" className="text-brand-teal hover:underline">My RSVPs</Link>
          <Link href="/profile" className="text-brand-teal hover:underline">Profile</Link>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <ActivityCard key={s.id} s={s} />
        ))}
      </div>
    </main>
  );
}
