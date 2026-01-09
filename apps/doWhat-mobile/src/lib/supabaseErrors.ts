export const isMissingColumnError = (
  error: { message?: string | null } | null,
  column: string,
): boolean => {
  const message = typeof error?.message === 'string' ? error.message : null;
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('column') && normalized.includes(column.toLowerCase());
};
