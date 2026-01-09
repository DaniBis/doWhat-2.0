interface EventAttendanceCardProps {
  eventId: string;
}

export function EventAttendanceCard({ eventId }: EventAttendanceCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Attendance</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">#{eventId.slice(0, 8)}</span>
      </header>
      <p className="text-sm text-slate-600">
        Attendance tracking for this event is coming soon. Hosts will be able to share availability and
        mark attendance directly from this panel once the feature ships.
      </p>
    </section>
  );
}
