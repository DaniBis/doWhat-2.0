import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from './supabase';

type EnsureUserRowInput = {
  id: string;
  email?: string | null;
  fullName?: string | null;
};

const isRowLevelSecurityError = (error: PostgrestError | { code?: string | null; message?: string | null; details?: string | null }): boolean => {
  const code = typeof error.code === 'string' ? error.code : null;
  const message = typeof error.message === 'string' ? error.message : '';
  const details = typeof error.details === 'string' ? error.details : '';
  if (code && code !== '42501') return false;
  return /row[- ]level security/i.test(message) || /row[- ]level security/i.test(details) || code === '42501';
};

const isUsersEmailConflict = (
  error: PostgrestError | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null; constraint?: string | null },
): boolean => {
  const code = typeof error.code === 'string' ? error.code : null;
  if (code !== '23505') return false;
  const constraint = 'constraint' in error && typeof (error as { constraint?: string }).constraint === 'string'
    ? (error as { constraint: string }).constraint
    : '';
  const markers = [error.message, error.details, error.hint, constraint].map((value) => (typeof value === 'string' ? value : ''));
  return markers.some((text) => /users?_email_key/i.test(text));
};

const ensureViaRpc = async ({ id, email, fullName }: EnsureUserRowInput): Promise<boolean> => {
  const { error } = await supabase.rpc('ensure_public_user_row', {
    p_user: id,
    p_email: email ?? null,
    p_full_name: fullName ?? null,
  });
  if (error) {
    if (__DEV__) console.warn('[ensureUserRow] ensure_public_user_row RPC failed', error);
    return false;
  }
  return true;
};

export const ensureUserRow = async ({ id, email, fullName }: EnsureUserRowInput): Promise<boolean> => {
  const resolvedEmail = typeof email === 'string' && email.trim() ? email.trim() : null;
  if (!resolvedEmail) {
    if (__DEV__) console.warn('[ensureUserRow] missing email, cannot upsert user row');
    return false;
  }

  const payload = { id, email: resolvedEmail, full_name: fullName ?? null };
  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });

  if (error) {
    if (isRowLevelSecurityError(error) || isUsersEmailConflict(error)) {
      return ensureViaRpc({ id, email: resolvedEmail, fullName });
    }

    if (__DEV__) console.warn('[ensureUserRow] users upsert failed', error);
    return false;
  }

  return true;
};
