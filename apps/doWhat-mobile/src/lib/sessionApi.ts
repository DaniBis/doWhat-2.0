import { buildWebUrl } from './web';

type JsonObject = Record<string, unknown>;

export type MobileSessionLocationKind = 'canonical_place' | 'legacy_venue' | 'custom_location' | 'flexible';

export type MobileSessionDetail = {
  id: string;
  activityId: string | null;
  venueId: string | null;
  placeId: string | null;
  startsAt: string;
  endsAt: string | null;
  priceCents: number;
  maxAttendees: number;
  visibility: 'public' | 'friends' | 'private';
  hostUserId: string;
  description: string | null;
  placeLabel: string | null;
  locationKind: MobileSessionLocationKind;
  isPlaceBacked: boolean;
  activity: {
    id: string | null;
    name: string | null;
    description?: string | null;
    venueLabel?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  venue: {
    id: string | null;
    name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  place: {
    id: string;
    name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    locality: string | null;
    region: string | null;
    country: string | null;
    categories: string[] | null;
  } | null;
};

export type CreateSessionRequest = {
  activityId?: string | null;
  activityName?: string | null;
  venueId?: string | null;
  placeId?: string | null;
  venueName?: string | null;
  lat: number;
  lng: number;
  price?: number;
  startsAt: string;
  endsAt: string;
  maxAttendees?: number;
  visibility?: 'public' | 'friends' | 'private';
  description?: string | null;
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error;
  }
  return fallback;
};

const buildHeaders = (accessToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${accessToken}`,
});

export const createSessionViaWebApi = async (
  payload: CreateSessionRequest,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MobileSessionDetail> => {
  const response = await fetchImpl(buildWebUrl('/api/sessions'), {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as JsonObject | null;
  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Failed to create session (${response.status})`));
  }
  const session = data && typeof data === 'object' ? (data.session as MobileSessionDetail | undefined) : undefined;
  if (!session || typeof session.id !== 'string') {
    throw new Error('Unexpected create-session response payload.');
  }
  return session;
};

export const fetchSessionDetailViaWebApi = async (
  sessionId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MobileSessionDetail> => {
  const response = await fetchImpl(buildWebUrl(`/api/sessions/${sessionId}`), {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });

  const data = (await response.json()) as JsonObject | null;
  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Failed to load session (${response.status})`));
  }
  const session = data && typeof data === 'object' ? (data.session as MobileSessionDetail | undefined) : undefined;
  if (!session || typeof session.id !== 'string') {
    throw new Error('Unexpected session detail response payload.');
  }
  return session;
};
