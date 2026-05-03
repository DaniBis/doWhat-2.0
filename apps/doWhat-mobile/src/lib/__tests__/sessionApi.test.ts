import { describe, expect, it, jest } from '@jest/globals';

import { createSessionViaWebApi, fetchSessionDetailViaWebApi } from '../sessionApi';

const participation = {
  attendance_supported: true,
  attendance_source_kind: 'session_attendance',
  first_party_attendance: true,
  rsvp_supported: true,
  verification_supported: true,
  participation_truth_level: 'first_party',
  host_kind: 'session_host',
  organizer_kind: 'dowhat_host',
} as const;

describe('sessionApi', () => {
  it('posts session creation through the web session API with bearer auth', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          id: 'session-1',
          activityId: 'activity-1',
          venueId: null,
          placeId: 'place-1',
          startsAt: '2026-03-10T10:00:00.000Z',
          endsAt: '2026-03-10T11:00:00.000Z',
          priceCents: 0,
          maxAttendees: 12,
          visibility: 'public',
          hostUserId: 'user-1',
          description: null,
          placeLabel: 'Downtown Court',
          locationKind: 'canonical_place',
          isPlaceBacked: true,
          participation,
          activity: { id: 'activity-1', name: 'Hoops' },
          venue: null,
          place: { id: 'place-1', name: 'Downtown Court', address: null, lat: null, lng: null, locality: null, region: null, country: null, categories: null },
        },
      }),
    } as Response);

    const session = await createSessionViaWebApi(
      {
        activityId: 'activity-1',
        lat: 44.43,
        lng: 26.1,
        startsAt: '2026-03-10T10:00:00.000Z',
        endsAt: '2026-03-10T11:00:00.000Z',
      },
      'token-123',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(session.id).toBe('session-1');
    expect(session.locationKind).toBe('canonical_place');
  });

  it('loads session details through the web session API with bearer auth', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          id: 'session-2',
          activityId: 'activity-2',
          venueId: 'venue-2',
          placeId: null,
          startsAt: '2026-03-10T10:00:00.000Z',
          endsAt: '2026-03-10T11:00:00.000Z',
          priceCents: 500,
          maxAttendees: 8,
          visibility: 'friends',
          hostUserId: 'user-2',
          description: 'Evening chess',
          placeLabel: 'Old Hall',
          locationKind: 'legacy_venue',
          isPlaceBacked: false,
          participation,
          activity: { id: 'activity-2', name: 'Chess' },
          venue: { id: 'venue-2', name: 'Old Hall', address: '123 Legacy St', lat: 44.43, lng: 26.1 },
          place: null,
        },
      }),
    } as Response);

    const session = await fetchSessionDetailViaWebApi('session-2', 'token-abc', fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/session-2'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-abc',
        }),
      }),
    );
    expect(session.placeLabel).toBe('Old Hall');
    expect(session.locationKind).toBe('legacy_venue');
  });

  it('accepts explicit flexible session payloads without a fabricated place label', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          id: 'session-3',
          activityId: null,
          venueId: null,
          placeId: null,
          startsAt: '2026-03-10T10:00:00.000Z',
          endsAt: '2026-03-10T11:00:00.000Z',
          priceCents: 0,
          maxAttendees: 10,
          visibility: 'public',
          hostUserId: 'user-3',
          description: null,
          placeLabel: null,
          locationKind: 'flexible',
          isPlaceBacked: false,
          participation,
          activity: { id: null, name: 'Open meetup' },
          venue: null,
          place: null,
        },
      }),
    } as Response);

    const session = await fetchSessionDetailViaWebApi('session-3', 'token-flex', fetchMock);

    expect(session.placeLabel).toBeNull();
    expect(session.locationKind).toBe('flexible');
    expect(session.isPlaceBacked).toBe(false);
  });
});
