"use client";

export default function ErrorSession({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="rounded-xl bg-red-50 p-4 text-red-700">
        Something went wrong loading this session: {error.message}
      </div>
      <button
        onClick={reset}
        className="mt-4 rounded-xl bg-brand-teal px-4 py-2 text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
