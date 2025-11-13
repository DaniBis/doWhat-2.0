import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient } from '@/lib/supabase/server';
import { upsertActivity } from '@/lib/activities';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await upsertActivity(body);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Upsert activity error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

