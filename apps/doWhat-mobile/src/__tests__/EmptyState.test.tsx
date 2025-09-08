import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EmptyState from '../components/EmptyState';
import { router } from 'expo-router';

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn()
  }
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));

describe('EmptyState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with required props', () => {
    const { getByText } = render(
      <EmptyState
        icon="calendar-outline"
        title="No Events"
        subtitle="There are no upcoming events in your area"
      />
    );

    expect(getByText('No Events')).toBeTruthy();
    expect(getByText('There are no upcoming events in your area')).toBeTruthy();
  });

  it('renders action button when actionText is provided', () => {
    const mockAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="calendar-outline"
        title="No Events"
        subtitle="There are no upcoming events in your area"
        actionText="Create Event"
        onAction={mockAction}
      />
    );

    const actionButton = getByText('Create Event');
    expect(actionButton).toBeTruthy();
  });

  it('calls onAction when action button is pressed', () => {
    const mockAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="calendar-outline"
        title="No Events"
        subtitle="There are no upcoming events in your area"
        actionText="Create Event"
        onAction={mockAction}
      />
    );

    const actionButton = getByText('Create Event');
    fireEvent.press(actionButton);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('navigates to actionRoute when no onAction is provided', () => {
    const { getByText } = render(
      <EmptyState
        icon="calendar-outline"
        title="No Events"
        subtitle="There are no upcoming events in your area"
        actionText="Create Event"
        actionRoute="/create"
      />
    );

    const actionButton = getByText('Create Event');
    fireEvent.press(actionButton);
    expect(router.push).toHaveBeenCalledWith('/create');
  });

  it('does not render action button when actionText is not provided', () => {
    const { queryByText } = render(
      <EmptyState
        icon="calendar-outline"
        title="No Events"
        subtitle="There are no upcoming events in your area"
      />
    );

    expect(queryByText('Create Event')).toBeFalsy();
  });
});
