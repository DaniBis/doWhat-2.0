import { NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/cron/auth';
import { listSeedCities, listSeedPacks, seedCityInventory } from '@/lib/seed/citySeeding';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const parseCoordinate = (value: string | null): { lat: number; lng: number } | null => {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) return null;
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const parseBoolean = (value: string | null, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
};

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const city = url.searchParams.get('city')?.trim();
  const mode = url.searchParams.get('mode')?.trim().toLowerCase();
  const tilesParam = url.searchParams.get('tiles') ?? url.searchParams.get('maxTiles');
  const precisionParam = url.searchParams.get('precision');
  const inferActivities = parseBoolean(url.searchParams.get('inferActivities'), true);
  const refresh = parseBoolean(url.searchParams.get('refresh'), mode !== 'incremental');
  const packsParam = url.searchParams.get('packs');
  const packVersionParam = url.searchParams.get('packVersion');
  const center = parseCoordinate(url.searchParams.get('center'));
  const sw = parseCoordinate(url.searchParams.get('sw'));
  const ne = parseCoordinate(url.searchParams.get('ne'));
  const bounds = sw && ne ? { sw, ne } : undefined;

  if (!city) {
    return NextResponse.json(
      {
        error: 'Missing required city parameter',
        supportedCities: listSeedCities(),
        supportedPacks: listSeedPacks(),
      },
      { status: 400 },
    );
  }

  if (mode && mode !== 'full' && mode !== 'incremental') {
    return NextResponse.json({ error: "Invalid mode. Use 'full' or 'incremental'." }, { status: 400 });
  }

  const tiles = tilesParam ? Number.parseInt(tilesParam, 10) : undefined;
  if (tilesParam && Number.isNaN(tiles ?? Number.NaN)) {
    return NextResponse.json({ error: 'Invalid tiles parameter' }, { status: 400 });
  }

  const precision = precisionParam ? Number.parseInt(precisionParam, 10) : undefined;
  if (precisionParam && Number.isNaN(precision ?? Number.NaN)) {
    return NextResponse.json({ error: 'Invalid precision parameter' }, { status: 400 });
  }

  if ((sw && !ne) || (!sw && ne)) {
    return NextResponse.json({ error: 'Both sw and ne must be provided for custom bounds' }, { status: 400 });
  }

  try {
    const result = await seedCityInventory({
      city,
      mode: mode === 'incremental' ? 'incremental' : 'full',
      maxTiles: tiles,
      precision,
      center: center ?? undefined,
      bounds,
      inferActivities,
      refresh,
      packs: packsParam
        ? packsParam
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined,
      packVersion: packVersionParam?.trim() || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to seed city inventory';
    return NextResponse.json(
      {
        error: message,
        supportedCities: listSeedCities(),
        supportedPacks: listSeedPacks(),
      },
      { status: 500 },
    );
  }
}
