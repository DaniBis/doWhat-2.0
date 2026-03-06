import { encodeActivityParam, NO_ACTIVITY_PARAM, resolveFocusedActivitySync } from '../focusedActivitySync';

describe('focusedActivitySync', () => {
  it('encodes null ids as the sentinel token', () => {
    expect(encodeActivityParam(null)).toBe(NO_ACTIVITY_PARAM);
    expect(encodeActivityParam('activity-1')).toBe('activity-1');
  });

  it('defers URL sync while waiting for router params to catch up', () => {
    const resolution = resolveFocusedActivitySync({
      requestedId: null,
      pendingEncodedId: 'activity-1',
    });
    expect(resolution).toEqual({
      defer: true,
      shouldClearPending: false,
    });
  });

  it('applies and clears pending sync once params match the requested activity', () => {
    const resolution = resolveFocusedActivitySync({
      requestedId: 'activity-1',
      pendingEncodedId: 'activity-1',
    });
    expect(resolution).toEqual({
      defer: false,
      shouldClearPending: true,
    });
  });

  it('applies and clears pending sync for explicit activity clear operations', () => {
    const resolution = resolveFocusedActivitySync({
      requestedId: null,
      pendingEncodedId: NO_ACTIVITY_PARAM,
    });
    expect(resolution).toEqual({
      defer: false,
      shouldClearPending: true,
    });
  });
});

