export default function LoadingRoot() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="rounded-xl border p-5 shadow-sm">
            <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-40 animate-pulse rounded bg-gray-200" />
            <div className="mt-4 h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-48 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </main>
  );
}
