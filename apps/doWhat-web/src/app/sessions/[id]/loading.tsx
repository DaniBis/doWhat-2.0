export default function LoadingSession() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-7 w-64 animate-pulse rounded bg-gray-200" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 h-24 w-full animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}
