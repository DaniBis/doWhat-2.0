export const isMissingColumnError = (
  source: string | { message?: string | null } | null | undefined,
  column: string,
): boolean => {
  const message = typeof source === 'string' ? source : source?.message;
  if (typeof message !== 'string') return false;
  const normalized = message.toLowerCase();
  return normalized.includes('column') && normalized.includes(column.toLowerCase());
};
