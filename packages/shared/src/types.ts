export type ActivityRow = {
  id: string;
  price_cents: number | null;
  starts_at: string | Date | null; // ISO string or Date OK
  ends_at: string | Date | null;
  activities?: { id?: string; name?: string | null } | null;
  venues?: { name?: string | null } | null;
};
