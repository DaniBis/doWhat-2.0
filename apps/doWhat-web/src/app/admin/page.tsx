import Link from "next/link";

export default function AdminIndex() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold">Admin</h1>
      <ul className="mt-4 space-y-2">
        <li><Link href="/admin/new" className="text-brand-teal">Create Session</Link></li>
        <li><Link href="/admin/sessions" className="text-brand-teal">Manage Sessions</Link></li>
        <li><Link href="/admin/activities" className="text-brand-teal">Manage Activities</Link></li>
        <li><Link href="/admin/venues" className="text-brand-teal">Manage Venues</Link></li>
      </ul>
    </main>
  );
}
