import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface BadgeRow { id: string; category?: string; name?: string; [key: string]: unknown }

// GET /api/badges -> list catalog
export async function GET() {
  const supabase = db();
  const { data, error } = await supabase.from('badges').select('*').order('category').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ badges: data as BadgeRow[] });
}
