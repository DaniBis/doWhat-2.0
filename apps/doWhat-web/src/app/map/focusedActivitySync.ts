export const NO_ACTIVITY_PARAM = '__none__';

export const encodeActivityParam = (activityId: string | null): string =>
  activityId ?? NO_ACTIVITY_PARAM;

type ResolveFocusedActivitySyncArgs = {
  requestedId: string | null;
  pendingEncodedId: string | null;
};

type DeferredSync = {
  defer: true;
  shouldClearPending: false;
};

type ApplySync = {
  defer: false;
  shouldClearPending: boolean;
};

export type FocusedActivitySyncResolution = DeferredSync | ApplySync;

export const resolveFocusedActivitySync = ({
  requestedId,
  pendingEncodedId,
}: ResolveFocusedActivitySyncArgs): FocusedActivitySyncResolution => {
  if (!pendingEncodedId) {
    return { defer: false, shouldClearPending: false };
  }

  const encodedRequested = encodeActivityParam(requestedId);
  if (encodedRequested !== pendingEncodedId) {
    return { defer: true, shouldClearPending: false };
  }

  return { defer: false, shouldClearPending: true };
};

