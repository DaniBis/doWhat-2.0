export default function LoadingAdminNew(){
  return (
    <main className="mx-auto max-w-3xl px-md py-xl">
      <div className="h-5 w-40 animate-pulse rounded bg-ink-subtle" />
      <div className="mt-md space-y-md">
        {[0,1,2].map(i => (
          <div key={i} className="rounded border p-md">
            <div className="h-4 w-32 animate-pulse rounded bg-ink-subtle" />
            <div className="mt-xs h-10 w-full animate-pulse rounded bg-surface-alt" />
          </div>
        ))}
      </div>
    </main>
  );
}
