import { describe, expect, it } from '@jest/globals';
import type { ActivityRow, MapActivity } from '@dowhat/shared';

import {
  buildHomeActivityEventCounts,
  groupDiscoveryActivitiesForHome,
  resolveHomeActivityCardMeta,
} from '../homeActivityCounts';

const buildSearchText = (parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');

const makeMapActivity = (overrides: Partial<MapActivity> = {}): MapActivity => ({
  id: overrides.id ?? 'activity-1',
  name: overrides.name ?? 'Climbing',
  place_label: overrides.place_label ?? 'VietClimb',
  place_id: overrides.place_id ?? 'place-1',
  lat: overrides.lat ?? 21.03,
  lng: overrides.lng ?? 105.85,
  upcoming_session_count: overrides.upcoming_session_count ?? 0,
  activity_types: overrides.activity_types ?? ['Rock Climbing'],
  taxonomy_categories: overrides.taxonomy_categories ?? ['climbing'],
  tags: overrides.tags ?? ['bouldering'],
  source: overrides.source ?? 'activities',
});

const makeActivityRow = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  id: overrides.id ?? 'session-1',
  price_cents: overrides.price_cents ?? 0,
  starts_at: overrides.starts_at ?? '2026-03-08T10:00:00.000Z',
  ends_at: overrides.ends_at ?? '2026-03-08T11:00:00.000Z',
  activities: overrides.activities ?? { id: 'activity-1', name: 'Climbing' },
  venues: overrides.venues ?? { name: 'VietClimb' },
});

describe('homeActivityCounts', () => {
  it('keeps zero-session discovery items at zero instead of inflating them to one', () => {
    const grouped = groupDiscoveryActivitiesForHome(
      [makeMapActivity({ name: 'Climbing', upcoming_session_count: 0 })],
      buildSearchText,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.count).toBe(0);

    const meta = resolveHomeActivityCardMeta(grouped[0]!, buildHomeActivityEventCounts([]));
    expect(meta).toEqual({
      eventCount: 0,
      badgeLabel: null,
      supportingLabel: 'Tap to view nearby places',
    });
  });

  it('renders a singular upcoming-event badge for one real session', () => {
    const grouped = groupDiscoveryActivitiesForHome(
      [makeMapActivity({ id: 'activity-1', name: 'Climbing', upcoming_session_count: 1 })],
      buildSearchText,
    );
    const counts = buildHomeActivityEventCounts([
      makeActivityRow({ activities: { id: 'activity-1', name: 'Climbing' } }),
    ]);

    const meta = resolveHomeActivityCardMeta(grouped[0]!, counts);
    expect(meta).toEqual({
      eventCount: 1,
      badgeLabel: '1 upcoming event',
      supportingLabel: 'Tap to view nearby places and times',
    });
  });

  it('sums multiple real sessions across nearby rows for the same activity', () => {
    const grouped = groupDiscoveryActivitiesForHome(
      [
        makeMapActivity({ id: 'activity-1', name: 'Climbing', upcoming_session_count: 2, place_label: 'VietClimb' }),
        makeMapActivity({ id: 'activity-2', name: 'Climbing', upcoming_session_count: 1, place_label: 'Another Gym' }),
      ],
      buildSearchText,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.count).toBe(3);

    const meta = resolveHomeActivityCardMeta(grouped[0]!, buildHomeActivityEventCounts([]));
    expect(meta).toEqual({
      eventCount: 3,
      badgeLabel: '3 upcoming events',
      supportingLabel: 'Tap to view nearby places and times',
    });
  });

  it('keeps counts independent for different nearby activity groups', () => {
    const grouped = groupDiscoveryActivitiesForHome(
      [
        makeMapActivity({ id: 'activity-1', name: 'Climbing', place_label: 'VietClimb', upcoming_session_count: 2 }),
        makeMapActivity({ id: 'activity-2', name: 'Yoga', place_label: 'Lotus Studio', upcoming_session_count: 1, activity_types: ['Yoga'] }),
      ],
      buildSearchText,
    );

    expect(grouped.map((activity) => ({ name: activity.name, count: activity.count }))).toEqual([
      { name: 'Climbing', count: 2 },
      { name: 'Yoga', count: 1 },
    ]);

    const counts = buildHomeActivityEventCounts([
      makeActivityRow({ id: 'session-1', activities: { id: 'activity-1', name: 'Climbing' }, venues: { name: 'VietClimb' } }),
      makeActivityRow({ id: 'session-2', activities: { id: 'activity-1', name: 'Climbing' }, venues: { name: 'VietClimb' } }),
      makeActivityRow({ id: 'session-3', activities: { id: 'activity-2', name: 'Yoga' }, venues: { name: 'Lotus Studio' } }),
    ]);

    expect(resolveHomeActivityCardMeta(grouped[0]!, counts).eventCount).toBe(2);
    expect(resolveHomeActivityCardMeta(grouped[1]!, counts).eventCount).toBe(1);
  });
});
