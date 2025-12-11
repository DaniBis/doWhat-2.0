import { createWebUrl } from './web';
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

export type AttendanceMutationResult = {
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  previousStatus: AttendanceStatus;
  counts: AttendanceCounts;
};

async function resolveAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function buildHeaders(options: { requireAuth?: boolean; json?: boolean } = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (options.json) {
    headers['Content-Type'] = 'application/json';
  }
  const token = await resolveAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (options.requireAuth) {
    throw new Error('Please sign in first.');
  }
  return headers;
}

async function request<T>(path: string, init?: RequestInit, requireAuth = false): Promise<T> {
  const url = createWebUrl(path);
  const headers = await buildHeaders({ requireAuth, json: init?.body !== undefined });
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error || 'Unable to process attendance request.');
  }
  return data;
}

export async function fetchAttendanceSummary(sessionId: string): Promise<AttendanceSummary> {
  return request<AttendanceSummary>(`/api/sessions/${sessionId}/attendance`);
}

export async function joinSessionAttendance(sessionId: string, status: 'going' | 'interested') {
  return request<AttendanceMutationResult>(
    `/api/sessions/${sessionId}/attendance/join`,
    {
      method: 'POST',
      body: JSON.stringify({ status }),
    },
    true,
  );
}

export async function leaveSessionAttendance(sessionId: string) {
  return request<AttendanceMutationResult>(
    `/api/sessions/${sessionId}/attendance/leave`,
    {
      method: 'POST',
    },
    true,
  );
}
