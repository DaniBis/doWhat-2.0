import Link from "next/link";

import RsvpBadges from "./RsvpBadges";

type Venue = { name?: string | null };
type Activities = { id?: string; name?: string | null };

type Item = {
  activities?: Activities | Activities[];
  venues?: Venue | Venue[];
  price_cents?: number | null;
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
  id?: string;
};

type Props = { s: Item };

export default function ActivityCard({ s }: Props) {
  const title = Array.isArray(s.activities)
    ? s.activities[0]?.name ?? "Running"
    : s.activities?.name ?? "Running";
  const venue = Array.isArray(s.venues)
    ? s.venues[0]?.name ?? "Venue"
    : s.venues?.name ?? "Venue";
  const activityId = Array.isArray(s.activities)
    ? s.activities[0]?.id
    : s.activities?.id;
  const price = (s.price_cents ?? 0) / 100;
  const when = `${new Date(s.starts_at as string).toLocaleString()} - ${new Date(
    s.ends_at as string
  ).toLocaleString()}`;

  return (
    <div className="card p-5 shadow-md">
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-gray-500">{venue}</div>
      <div className="mt-2 font-semibold">€{price.toFixed(2)}</div>
      <div className="text-sm text-gray-500">{when}</div>
      <div className="mt-2">
        <RsvpBadges activityId={activityId ?? null} />
      </div>
      <Link
        href={`/sessions/${s.id}`}
        className="btn mt-4 bg-green-600 text-white"
      >
        View details
      </Link>
    </div>
  );
}
