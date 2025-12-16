export type CreateSessionResponse = {
  id?: string | null;
  session?: { id?: string | null } | null;
  error?: string | null;
};

export const extractSessionId = (payload: CreateSessionResponse | null | undefined): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.id && typeof payload.id === 'string' && payload.id.trim()) {
    return payload.id.trim();
  }
  const nested = payload.session?.id;
  if (nested && typeof nested === 'string' && nested.trim()) {
    return nested.trim();
  }
  return null;
};
