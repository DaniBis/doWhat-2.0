import { trackAttendanceDisputeSubmitted } from '@dowhat/shared';

import { createWebUrl } from './web';

export type AttendanceDisputeRequest = {
  sessionId: string;
  reason: string;
  details?: string | null;
};

export type AttendanceDisputeHistoryItem = {
  id: string;
  sessionId: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  reason: string;
  details: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    title: string | null;
    venue: string | null;
    endsAt: string | null;
    startsAt: string | null;
  };
};

export async function submitAttendanceDispute({ sessionId, reason, details = null }: AttendanceDisputeRequest) {
  if (!sessionId) {
    throw new Error('Missing session id.');
  }
  const trimmedReason = reason.trim();
  const payloadDetails = typeof details === 'string' ? details : null;
  const endpoint = createWebUrl('/api/disputes');
  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      sessionId,
      reason: trimmedReason,
      details: payloadDetails ?? null,
    }),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = extractErrorMessage(json) ?? 'Failed to submit dispute.';
    throw new Error(message);
  }
  trackAttendanceDisputeSubmitted({
    platform: 'mobile',
    sessionId,
    hasDetails: Boolean(payloadDetails && payloadDetails.trim()),
    reasonLength: trimmedReason.length,
  });
  return json;
}

export async function fetchAttendanceDisputes(): Promise<AttendanceDisputeHistoryItem[]> {
  const endpoint = createWebUrl('/api/disputes');
  const response = await fetch(endpoint.toString(), {
    credentials: 'include',
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = extractErrorMessage(json) ?? 'Failed to load dispute history.';
    throw new Error(message);
  }
  if (json && typeof json === 'object' && Array.isArray((json as { disputes?: unknown }).disputes)) {
    return ((json as { disputes: AttendanceDisputeHistoryItem[] }).disputes) ?? [];
  }
  return [];
}

function extractErrorMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in (payload as Record<string, unknown>)) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return null;
}
