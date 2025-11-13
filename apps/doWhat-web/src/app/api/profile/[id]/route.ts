import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { ensureProfileColumns } from '@/lib/db/ensureProfileColumns';
import type { ProfileUser } from '@/types/profile';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

type ProfileRow = {
  id?: string | null;
  full_name?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestedId = params.id === 'me' ? auth.user.id : params.id;
  if (requestedId !== auth.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ensureProfileColumns().catch((error) => {
    console.warn('ensureProfileColumns failed during profile GET', getErrorMessage(error));
  });

  const baseColumns = ['id', 'full_name', 'avatar_url'] as const;
  const optionalColumns: string[] = ['bio', 'location', 'instagram', 'whatsapp'];

  async function fetchProfile(columns: readonly string[]): Promise<{ data: ProfileRow | null; error: PostgrestError | null }> {
    const { data, error } = await supabase
      .from('profiles')
      .select(columns.join(', '))
      .eq('id', requestedId)
      .maybeSingle<ProfileRow>();

    return {
      data: data ?? null,
      error,
    };
  }

  let remainingOptional = [...optionalColumns];
  let profileRow: ProfileRow | null = null;
  let lastError: unknown = null;

  while (true) {
    const { data, error } = await fetchProfile([...baseColumns, ...remainingOptional]);
    if (!error) {
      profileRow = data;
      lastError = null;
      break;
    }
    lastError = error;
    const message = error?.message ?? '';
    const missingMatch = message.match(/column "?([\w.]+)"? does not exist/i);
    if (!missingMatch) break;
    const missingColumn = missingMatch[1]?.split('.').pop();
    if (!missingColumn || !remainingOptional.includes(missingColumn)) break;
    remainingOptional = remainingOptional.filter((col) => col !== missingColumn);
    if (remainingOptional.length === 0) {
      const { data: baseData, error: baseError } = await fetchProfile(baseColumns);
      if (!baseError) {
        profileRow = baseData;
        lastError = null;
      } else {
        lastError = baseError;
      }
      break;
    }
  }

  if (lastError) {
    return NextResponse.json({ error: getErrorMessage(lastError) }, { status: 500 });
  }

  const profile: ProfileUser = {
    id: requestedId,
    name: profileRow?.full_name || auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || auth.user.email || 'User',
    email: auth.user.email || '',
    location: typeof profileRow?.location === 'string' ? profileRow.location : undefined,
    avatarUrl: profileRow?.avatar_url || auth.user.user_metadata?.avatar_url || undefined,
    bio: typeof profileRow?.bio === 'string' ? profileRow.bio : undefined,
    socials: profileRow ? {
      instagram: typeof profileRow.instagram === 'string' ? profileRow.instagram : undefined,
      whatsapp: typeof profileRow.whatsapp === 'string' ? profileRow.whatsapp : undefined,
    } : undefined,
  };

  return NextResponse.json(profile);
}
