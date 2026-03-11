import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const readSource = (...segments: string[]) =>
  fs.readFileSync(path.resolve(__dirname, '..', ...segments), 'utf8');

describe('mobile map filter surface', () => {
  it('only keeps the supported activity-first filters on the map screen', () => {
    const source = readSource('(tabs)', 'map', 'index.tsx');

    expect(source).toContain('Activity search');
    expect(source).toContain('Refine activities');
    expect(source).toContain('All activity places');
    expect(source).toContain('Activity categories');
    expect(source).toContain('Result strictness');
    expect(source).toContain('Confirmed only');
    expect(source).toContain('Search by activity venue, neighborhood, category, or brand.');

    expect(source).not.toContain('All place types');
    expect(source).not.toContain('coffee');
    expect(source).not.toContain('Working hours');
    expect(source).not.toContain('Group size');
    expect(source).not.toContain('temporarily unavailable');
  });

  it('labels mixed discovery results as sessions and imported events instead of generic event placeholders', () => {
    const source = readSource('(tabs)', 'map', 'index.tsx');

    expect(source).toContain('Sessions & events nearby');
    expect(source).toContain('doWhat sessions plus imported happenings in this map view.');
    expect(source).toContain('No upcoming sessions or events here yet. Move the map or zoom out.');
    expect(source).toContain('discoverySummary.badgeLabel');
    expect(source).toContain('discoverySummary.primaryActionLabel');

    expect(source).not.toContain('Community confirmations nearby');
    expect(source).not.toContain('No upcoming events here yet. Move the map or zoom out.');
  });

  it('keeps saved activity preferences separate from live map filters', () => {
    const source = readSource('filter.tsx');

    expect(source).toContain('Activity preferences');
    expect(source).toContain('Tune your activity feed');
    expect(source).toContain('Map filters stay on the map screen.');

    expect(source).not.toContain('Free activities only');
  });
});
