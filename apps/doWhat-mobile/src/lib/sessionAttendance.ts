import { supabase } from './supabase';

export type AttendanceStatus = 'going' | 'interested' | 'declined' | null;

export type AttendanceCounts = {
  going: number;
  interested: number;
  declined: number;
  total: number;
  verified: number;
};

export type AttendanceSummary = {
  sessionId: string;
  userId: string | null;
  status: AttendanceStatus;
  counts: AttendanceCounts;
  maxAttendees: number;
};

type AttendanceMutationResult = {
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  previousStatus: AttendanceStatus;
  counts: AttendanceCounts;
};
const FUNCTION_NAME = 'mobile-session-attendance';

type AttendanceFunctionSummary = AttendanceSummary;
type AttendanceFunctionMutation = AttendanceMutationResult;

async function ensureAuthenticated() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new Error('Please sign in first.');
  }
}

async function invokeAttendanceFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, {
    body,
  });
  if (error) {
    const message = typeof error.message === 'string' && error.message.trim() ? error.message : 'Unable to process attendance request.';
    throw new Error(message);
  }
  if (!data) {
    throw new Error('Unable to process attendance request.');
  }
  return data;
}

export async function fetchAttendanceSummary(sessionId: string): Promise<AttendanceSummary> {
  return invokeAttendanceFunction<AttendanceFunctionSummary>({
    action: 'summary',
    sessionId,
  });
}

export async function joinSessionAttendance(sessionId: string, status: 'going' | 'interested') {
  await ensureAuthenticated();
  return invokeAttendanceFunction<AttendanceFunctionMutation>({
    action: 'join',
    sessionId,
    status,
  });
}

export async function leaveSessionAttendance(sessionId: string) {
  await ensureAuthenticated();
  return invokeAttendanceFunction<AttendanceFunctionMutation>({
    action: 'leave',
    sessionId,
  });
}
