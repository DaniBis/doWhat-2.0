import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  rankSessionsForUser,
  type RankableProfile,
  type RankedSession,
  type SessionWithSlots,
  type SportType,
} from '@dowhat/shared';
import { supabase } from '../lib/supabase';
import { getLastKnownBackgroundLocation } from '../lib/bg-location';

const normalizeMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export type Coordinates = { lat: number | null; lng: number | null };

export type RankedOpenSession = RankedSession & {
  session: SessionWithSlots & {
    activityName?: string | null;
    activityId?: string | null;
    venueName?: string | null;
    priceCents?: number | null;
    endsAt?: string | null;
    openSlotMeta?: {
      slotId: string;
      slotsCount: number;
      requiredSkillLevel: string | null;
    };
  };
};

export type UseRankedOpenSessionsOptions = {
  enabled?: boolean;
  limit?: number;
  autoRefresh?: boolean;
};

export type UseRankedOpenSessionsRefreshOptions = {
  coordinates?: Coordinates | null;
};

export type UseRankedOpenSessionsResult = {
  sessions: RankedOpenSession[];
  isLoading: boolean;
  error: string | null;
  coords: Coordinates;
  refresh: (options?: UseRankedOpenSessionsRefreshOptions) => Promise<void>;
};

type ProfileLocationRow = {
  id: string;
  primary_sport: SportType | null;
  last_lat: number | null;
  last_lng: number | null;
};

type SportProfileRow = {
  sport: SportType | null;
  skill_level: string | null;
};

type SessionRelation = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number | null;
  activity_id: string | null;
  activities:
    | {
        id?: string | null;
        name?: string | null;
        sport_type?: SportType | null;
      }
    | Array<{
        id?: string | null;
        name?: string | null;
        sport_type?: SportType | null;
      }>
    | null;
  venues:
    | {
        id?: string | null;
        name?: string | null;
        lat?: number | null;
        lng?: number | null;
      }
    | Array<{
        id?: string | null;
        name?: string | null;
        lat?: number | null;
        lng?: number | null;
      }>
    | null;
};

type SessionOpenSlotRow = {
  id: string;
  slots_count: number;
  required_skill_level: string | null;
  sessions: SessionRelation | SessionRelation[] | null;
};

const deriveCoordinates = async (
  userId: string | null,
  profile: ProfileLocationRow | null,
  override?: Coordinates | null,
): Promise<Coordinates> => {
  if (override && (override.lat != null || override.lng != null)) {
    return { lat: override.lat ?? null, lng: override.lng ?? null };
  }

  let lat = override?.lat ?? null;
  let lng = override?.lng ?? null;

  if (lat == null || lng == null) {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }
      if (status === 'granted') {
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (lastKnown?.coords) {
          lat = Number(lastKnown.coords.latitude.toFixed(6));
          lng = Number(lastKnown.coords.longitude.toFixed(6));
        }
      }
    } catch {}
  }

  if (lat == null || lng == null) {
    try {
      const cached = await getLastKnownBackgroundLocation();
      if (cached) {
        lat = cached.lat;
        lng = cached.lng;
      }
    } catch {}
  }

  if (lat == null || lng == null) {
    if (profile?.last_lat != null && profile?.last_lng != null) {
      lat = profile.last_lat;
      lng = profile.last_lng;
    }
  }

  if ((lat == null || lng == null) && userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('last_lat,last_lng')
        .eq('id', userId)
        .maybeSingle<Pick<ProfileLocationRow, 'last_lat' | 'last_lng'>>();
      if (data?.last_lat != null && data?.last_lng != null) {
        lat = data.last_lat;
        lng = data.last_lng;
      }
    } catch {}
  }

  return { lat, lng };
};

const mapSessions = (rows: SessionOpenSlotRow[]): Array<SessionWithSlots & {
  activityName?: string | null;
  activityId?: string | null;
  venueName?: string | null;
  priceCents?: number | null;
  endsAt?: string | null;
  openSlotMeta: { slotId: string; slotsCount: number; requiredSkillLevel: string | null };
}> => {
  return rows.reduce<Array<SessionWithSlots & {
    activityName?: string | null;
    activityId?: string | null;
    venueName?: string | null;
    priceCents?: number | null;
    endsAt?: string | null;
    openSlotMeta: { slotId: string; slotsCount: number; requiredSkillLevel: string | null };
  }>>((acc, row) => {
    const sessionRelation = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!sessionRelation) return acc;

    const activityRelation = Array.isArray(sessionRelation.activities)
      ? sessionRelation.activities[0]
      : sessionRelation.activities;
    const venueRelation = Array.isArray(sessionRelation.venues)
      ? sessionRelation.venues[0]
      : sessionRelation.venues;

    acc.push({
      id: sessionRelation.id,
      sport: (activityRelation?.sport_type as SportType) ?? null,
      startsAt: sessionRelation.starts_at ?? new Date().toISOString(),
      requiredSkillLevel: row.required_skill_level ?? null,
      latitude: venueRelation?.lat ?? null,
      longitude: venueRelation?.lng ?? null,
      openSlots: {
        slotsTotal: row.slots_count,
        slotsTaken: 0,
      },
      activityName: activityRelation?.name ?? null,
      activityId: activityRelation?.id ?? sessionRelation.activity_id ?? null,
      venueName: venueRelation?.name ?? null,
      priceCents: sessionRelation.price_cents ?? null,
      endsAt: sessionRelation.ends_at ?? null,
      openSlotMeta: {
        slotId: row.id,
        slotsCount: row.slots_count,
        requiredSkillLevel: row.required_skill_level ?? null,
      },
    });

    return acc;
  }, []);
};

export const useRankedOpenSessions = (
  options: UseRankedOpenSessionsOptions = {},
): UseRankedOpenSessionsResult => {
  const { enabled = true, limit = 24, autoRefresh = true } = options;
  const [sessions, setSessions] = useState<RankedOpenSession[]>([]);
  const [coords, setCoords] = useState<Coordinates>({ lat: null, lng: null });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const refresh = useCallback(
    async (refreshOptions?: UseRankedOpenSessionsRefreshOptions) => {
      if (!enabled) {
        if (!mountedRef.current) return;
        setSessions([]);
        setCoords({ lat: null, lng: null });
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getSession();
        const userId = auth.session?.user?.id ?? null;

        let profileRow: ProfileLocationRow | null = null;
        let sportRows: SportProfileRow[] = [];
        if (userId) {
          const [profileResult, sportResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('id, primary_sport, last_lat, last_lng')
              .eq('id', userId)
              .maybeSingle<ProfileLocationRow>(),
            supabase
              .from('user_sport_profiles')
              .select('sport, skill_level')
              .eq('user_id', userId),
          ]);

          if (profileResult.error && profileResult.error.code !== 'PGRST116') {
            throw profileResult.error;
          }
          if (sportResult.error && sportResult.error.code !== 'PGRST116') {
            throw sportResult.error;
          }

          profileRow = profileResult.data ?? null;
          sportRows = Array.isArray(sportResult.data)
            ? (sportResult.data as SportProfileRow[])
            : [];
        }

        const derivedCoords = await deriveCoordinates(
          userId,
          profileRow,
          refreshOptions?.coordinates ?? null,
        );

        const { data, error: slotsError } = await supabase
          .from('session_open_slots')
          .select(
            `id, slots_count, required_skill_level,
             sessions!inner (
               id,
               starts_at,
               ends_at,
               price_cents,
               activity_id,
               activities ( id, name, sport_type ),
               venues ( id, name, lat, lng )
             )`,
          )
          .gte('sessions.starts_at', new Date().toISOString())
          .limit(limit);

        if (slotsError) throw slotsError;

        const rows = Array.isArray(data) ? (data as SessionOpenSlotRow[]) : [];
        const mappedSessions = mapSessions(rows);

        let ranked: RankedOpenSession[] = [];
        if (mappedSessions.length) {
          const rankableProfile: RankableProfile = {
            id: userId ?? profileRow?.id ?? 'anonymous',
            latitude: derivedCoords.lat ?? profileRow?.last_lat ?? null,
            longitude: derivedCoords.lng ?? profileRow?.last_lng ?? null,
            primarySport: profileRow?.primary_sport ?? null,
            defaultSkillLevel: null,
            sportProfiles: sportRows.map((row) => ({
              sport: row.sport,
              skillLevel: row.skill_level ?? null,
            })),
          };

          ranked = rankSessionsForUser(rankableProfile, mappedSessions) as RankedOpenSession[];
        }

        if (!mountedRef.current) return;
        setSessions(ranked);
        setCoords({ lat: derivedCoords.lat ?? null, lng: derivedCoords.lng ?? null });
      } catch (err) {
        if (__DEV__) {
          console.error('[useRankedOpenSessions] failed to load open sessions', err);
        }
        if (!mountedRef.current) return;
        setSessions([]);
        setCoords({ lat: null, lng: null });
        setError(normalizeMessage(err, 'Unable to load open sessions.'));
      } finally {
        if (!mountedRef.current) return;
        setIsLoading(false);
      }
    },
    [enabled, limit],
  );

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      setCoords({ lat: null, lng: null });
      setError(null);
      setIsLoading(false);
      return;
    }
    if (autoRefresh) {
      void refresh();
    }
  }, [autoRefresh, enabled, refresh]);

  return {
    sessions,
    isLoading,
    error,
    coords,
    refresh,
  };
};
