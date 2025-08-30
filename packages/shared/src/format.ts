export function formatPrice(cents: number | null | undefined, currency = "EUR") {
  if (cents == null) return "";
  const value = cents / 100;
  try {
    return value.toLocaleString(undefined, { style: "currency", currency });
  } catch {
    return `€${value.toFixed(2)}`;
  }
}

export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
) {
  if (!start || !end) return "";
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return `${s.toLocaleString()} - ${e.toLocaleString()}`;
}
