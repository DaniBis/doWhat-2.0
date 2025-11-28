import { NextResponse } from 'next/server';

import { getCachedTaxonomy, loadTaxonomy } from '@/lib/taxonomy/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('force')?.toLowerCase() === 'true';
    const data = await loadTaxonomy(forceRefresh);
    return NextResponse.json({
      version: data.version,
      fetchedAt: data.fetchedAt,
      taxonomy: data.taxonomy,
    });
  } catch (error) {
    console.error('[api/taxonomy] failed to load taxonomy', error);
    const fallback = getCachedTaxonomy();
    return NextResponse.json(
      {
        version: fallback.version,
        fetchedAt: fallback.fetchedAt,
        taxonomy: fallback.taxonomy,
        fallback: true,
      },
      { status: 200 },
    );
  }
}
