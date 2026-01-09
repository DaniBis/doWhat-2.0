interface EventVerificationCardProps {
  eventId: string;
}

export function EventVerificationCard({ eventId }: EventVerificationCardProps) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
      <header className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Community confirmations</p>
        <h2 className="text-lg font-semibold text-emerald-900">Verification coming soon</h2>
      </header>
      <p className="text-sm text-emerald-900/80">
        We are still wiring up the verification flows for events. Once ready, members will be able to
        confirm details, share updates, and review the trust signal for event <code className="rounded bg-white/70 px-1 py-px">{eventId}</code> right here.
      </p>
    </section>
  );
}
