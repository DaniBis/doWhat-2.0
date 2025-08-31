export default function LoadingAdminNew(){
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 space-y-4">
        {[0,1,2].map(i => (
          <div key={i} className="rounded border p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </main>
  );
}
