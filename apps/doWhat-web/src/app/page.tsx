import Link from "next/link";
import ActivityCard from "@/components/ActivityCard";
import { createClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

const NearbyDiscoverList = dynamic(() => import("@/components/home/NearbyDiscoverList"), { ssr: false });

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const supabase = createClient();

  const typesCsv = (typeof searchParams?.types === 'string' ? searchParams?.types : Array.isArray(searchParams?.types) ? searchParams?.types[0] : '') || '';
  const types = typesCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const priceMin = Number(typeof searchParams?.price_min === 'string' ? searchParams?.price_min : Array.isArray(searchParams?.price_min) ? searchParams?.price_min[0] : '0') || 0;
  const priceMax = Number(typeof searchParams?.price_max === 'string' ? searchParams?.price_max : Array.isArray(searchParams?.price_max) ? searchParams?.price_max[0] : '100') || 100;

  let query = supabase
    .from("sessions")
    .select("id, price_cents, starts_at, ends_at, activities!inner(id,name), venues(name)")
    .order("starts_at", { ascending: true })
    .limit(20);

  if (priceMin > 0) query = query.gte('price_cents', Math.round(priceMin * 100));
  if (priceMax < 100) query = query.lte('price_cents', Math.round(priceMax * 100));
  if (types.length) {
    const ors = types.map((t) => `activities.name.ilike.%${t}%`).join(',');
    query = query.or(ors);
  }

  const { data, error } = await query;

  if (error) {
    return <pre>Error: {error.message}</pre>;
  }

  const rows = data ?? [];

  return (
    <main className="min-h-screen">
      {/* Upcoming Activities only */}
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Upcoming Activities</h2>
            <p className="text-gray-600">Created events and nearby results</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link 
              href="/filter?from=home" 
              className="inline-flex items-center gap-2 rounded-lg border border-purple-500 px-4 py-2 text-purple-500 hover:bg-purple-50 font-medium transition-colors"
            >
              ⚙️ Filters
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600 mb-6">Be the first to create an event in your area!</p>
            <Link 
              href="/create" 
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-white font-semibold hover:bg-emerald-600 transition-colors"
            >
              <span>✨</span>
              Create First Event
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <ActivityCard key={s.id} s={s} />
            ))}
          </div>
        )}
        {/* Nearby discovered via API */}
        <div className="mt-12">
          <NearbyDiscoverList />
        </div>
      </div>
    </main>
  );
}
