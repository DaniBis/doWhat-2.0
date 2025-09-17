import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureTraitByName, recomputeUserTraits } from '@/lib/traits';
import { db } from '@/lib/db';

interface CatalogTuple extends Array<string> { 0: string; 1: string; 2: string }
interface TraitCatalogRow { id: string; name: string }
interface SeedEvent { name: string; delta: number }

export async function POST(_req: NextRequest) {
  const auth = createClient();
  const { data: u } = await auth.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = db();
  try {
    const catalog: CatalogTuple[] = [
      ['Punctual','behavior','Shows up on time'],
      ['Reliable','behavior','Keeps commitments'],
      ['Curious','growth','Explores new activities'],
      ['Open-minded','growth','Welcomes diverse experiences'],
      ['Consistent','behavior','Stable participation'],
    ];
    for (const [n,c,d] of catalog) await ensureTraitByName(supabase, n, c, d);
    const { data: rows } = await supabase.from('traits_catalog').select('id,name').in('name', catalog.map(c=>c[0]));
    const nameToId = new Map<string,string>((rows as TraitCatalogRow[] | null)?.map(r=>[r.name, r.id]) || []);
    const now = new Date();
    const events = ([
      { name: 'Punctual', delta: 8 },
      { name: 'Reliable', delta: 6 },
      { name: 'Curious', delta: 15 },
      { name: 'Open-minded', delta: 9 },
      { name: 'Consistent', delta: 5 },
    ] as SeedEvent[]).map(e => ({
      user_id: userId,
      trait_id: nameToId.get(e.name),
      source_type: 'demo',
      delta: e.delta,
      weight: 1,
      occurred_at: now.toISOString(),
      metadata: { seed: true }
    })).filter(e=>e.trait_id);
    if (events.length) await supabase.from('trait_events').insert(events);
    await recomputeUserTraits(userId);
    return NextResponse.json({ ok: true, inserted: events.length });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
