import { trackAttendanceDisputeSubmitted } from '@dowhat/shared';

import { supabase } from './supabase';

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

const FUNCTION_NAME = 'mobile-disputes';

type DisputeSubmitResponse = {
  id: string;
  status: AttendanceDisputeHistoryItem['status'];
  createdAt: string;
};

type DisputeHistoryResponse = {
  disputes?: AttendanceDisputeHistoryItem[];
};

async function invokeDisputeFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, {
    body,
  });
  if (error) {
    const message = typeof error.message === 'string' && error.message.trim() ? error.message : 'Dispute service unavailable.';
    throw new Error(message);
  }
  if (!data) {
    throw new Error('Dispute service returned no data.');
  }
  return data;
}

export async function submitAttendanceDispute({ sessionId, reason, details = null }: AttendanceDisputeRequest) {
  if (!sessionId) {
    throw new Error('Missing session id.');
  }
  const trimmedReason = reason.trim();
  const payloadDetails = typeof details === 'string' ? details : null;
  const result = await invokeDisputeFunction<DisputeSubmitResponse>({
    action: 'submit',
    sessionId,
    reason: trimmedReason,
    details: payloadDetails ?? null,
  });
  trackAttendanceDisputeSubmitted({
    platform: 'mobile',
    sessionId,
    hasDetails: Boolean(payloadDetails && payloadDetails.trim()),
    reasonLength: trimmedReason.length,
  });
  return result;
}

export async function fetchAttendanceDisputes(): Promise<AttendanceDisputeHistoryItem[]> {
  const payload = await invokeDisputeFunction<DisputeHistoryResponse>({ action: 'list' });
  if (payload && typeof payload === 'object' && Array.isArray(payload.disputes)) {
    return payload.disputes;
  }
  return [];
}
