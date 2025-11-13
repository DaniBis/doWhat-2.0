"use client";

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/browser';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

type Status = 'going' | 'interested' | 'declined';

type Props = {
  activityId?: string | null;
  sessionId?: string | null;
  className?: string;
  size?: "default" | "compact";
};

type Toast = {
  type: 'success' | 'error';
  message: string;
};

export default function RsvpQuickActions({ activityId, sessionId, className, size = "default" }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!sessionId && !activityId) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setStatus(null);
        return;
      }
      let query = supabase
        .from('rsvps')
        .select('status')
        .eq('user_id', uid)
        .limit(1);
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else if (activityId) {
        query = query.eq('activity_id', activityId);
      }
      const { data, error } = await query.maybeSingle<{ status: Status }>();
      if (error) throw error;
      setStatus(data?.status ?? null);
    } catch (error) {
      console.error('Failed to load RSVP status', error);
    }
  }, [activityId, sessionId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  async function updateStatus(next: Status) {
    if (!sessionId && !activityId) {
      setToast({ type: 'error', message: 'Missing session reference.' });
      return;
    }
    setLoading(true);
    setToast(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        throw new Error('Please sign in first.');
      }

      const upsert = {
        activity_id: activityId ?? null,
        session_id: sessionId ?? null,
        user_id: uid,
        status: next,
      };

      const conflictTarget = sessionId ? 'session_id,user_id' : 'activity_id,user_id';

      let { error } = await supabase
        .from('rsvps')
        .upsert(upsert, { onConflict: conflictTarget });

      const conflictMessage = error?.message ?? '';
      const isGenericConflict = /no unique or exclusion constraint/i.test(conflictMessage);
      const isActivityConflict = /rsvps_user_activity_unique/i.test(conflictMessage);
      const isSessionConflict = /rsvps_session_user_unique/i.test(conflictMessage);

      if (error && sessionId && activityId && (isActivityConflict || isGenericConflict)) {
        const updateResult = await supabase
          .from('rsvps')
          .update({ session_id: sessionId, status: next })
          .eq('user_id', uid)
          .eq('activity_id', activityId);

        if (!updateResult.error) {
          error = null;
        } else {
          error = updateResult.error;
        }
      }

      if (error && sessionId && (isSessionConflict || isGenericConflict)) {
        // Fall back to manual replace if constraint mismatch on session target
        await supabase.from('rsvps').delete().eq('session_id', sessionId).eq('user_id', uid);
        const insertResult = await supabase.from('rsvps').insert(upsert);
        error = insertResult.error ?? null;
      }

      if (error) throw error;
      setStatus(next);
      if (sessionId && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('session-rsvp-updated', {
            detail: { sessionId, status: next, userId: uid },
          })
        );
      }
      setToast({
        type: 'success',
        message: next === 'going' ? "You're going!" : 'Marked interested.',
      });
    } catch (error) {
      setToast({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  const disableGoing = loading || status === 'going';
  const disableInterested = loading || status === 'interested';

  const baseButtonClasses =
    "rounded-full px-4 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";
  const compactClasses = size === "compact" ? "px-3 py-1 text-xs" : "";

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateStatus('going')}
          disabled={disableGoing}
          className={`${baseButtonClasses} ${compactClasses} bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300`}
        >
          {status === 'going' ? 'You’re going' : 'I’m going'}
        </button>
        <button
          type="button"
          onClick={() => updateStatus('interested')}
          disabled={disableInterested}
          className={`${baseButtonClasses} ${compactClasses} border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {status === 'interested' ? 'Interested' : 'I’m interested'}
        </button>
      </div>
      {toast && (
        <p
          className={`mt-2 text-sm ${toast.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
