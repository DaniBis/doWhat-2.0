import { createClient } from "@/lib/supabase/server";
import ActivityCard from "@/components/ActivityCard";
import Link from "next/link";

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
      <div className="mb-4 flex justify-end gap-4 text-sm">
        <Link href="/my/rsvps" className="text-brand-teal text-sm">My RSVPs</Link>
        <Link href="/profile" className="text-brand-teal">Profile</Link>
        <Link href="/admin/new" className="text-brand-teal">Admin: New Session</Link>
        <Link href="/admin/sessions" className="text-brand-teal">Admin: Sessions</Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <ActivityCard key={s.id} s={s} />
        ))}
      </div>
    </main>
  );
}
