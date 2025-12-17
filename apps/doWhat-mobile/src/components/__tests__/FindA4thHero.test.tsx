import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import FindA4thHero, { type FindA4thHeroSession } from '../FindA4thHero';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Link: ({ children }: { children: React.ReactElement }) => React.cloneElement(children),
  };
});

const buildSession = (overrides: Partial<FindA4thHeroSession> = {}): FindA4thHeroSession => ({
  id: 'session-1',
  sportLabel: 'Padel Mix',
  venueLabel: 'River Courts',
  startsAt: '2025-12-13T15:00:00.000Z',
  openSlots: 2,
  ...overrides,
});

describe('FindA4thHero', () => {
  it('renders hero content when sessions exist', () => {
    const handlePress = jest.fn();
    const { getByTestId, getByText } = render(
      <FindA4thHero sessions={[buildSession()]} onPress={handlePress} />,
    );

    expect(getByTestId('find-a-4th-hero')).toBeTruthy();
    expect(getByText('Padel Mix')).toBeTruthy();

    fireEvent.press(getByText('Padel Mix'));
    expect(handlePress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1', sportLabel: 'Padel Mix' }),
    );
  });

  it('hides hero when sessions are empty', () => {
    const { queryByTestId } = render(<FindA4thHero sessions={[]} />);
    expect(queryByTestId('find-a-4th-hero')).toBeNull();
  });
});
