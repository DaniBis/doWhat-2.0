#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import loadEnv from './utils/load-env.mjs';

loadEnv();

const pickEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const supabaseUrl = pickEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const anonKey = pickEnv('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
const serviceKey = pickEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error('[trait-policies] Missing Supabase environment variables. Ensure SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const state = {
  users: [],
  traitIds: [],
  insertedTraitIds: [],
  sessions: [],
  votes: [],
  summaryTargets: new Set(),
};

const failures = [];
const keepDataFlag = (process.env.TRAIT_HEALTH_KEEP_DATA ?? '').toLowerCase();
const keepData = ['1', 'true', 'yes'].includes(keepDataFlag);

const iso = (date) => date.toISOString();

const step = async (label, fn) => {
  process.stdout.write(`- ${label}... `);
  try {
    await fn();
    console.log('ok');
  } catch (error) {
    console.log('FAIL');
    failures.push({ label, error });
  }
};

const ensureProfile = async (userId, fullName, email) => {
  const { error } = await service.from('profiles').upsert(
    {
      id: userId,
      user_id: userId,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`[profiles] upsert failed: ${error.message}`);
};

const createTestUser = async (label) => {
  const email = `trait-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = `Temp-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error(`[auth] createUser failed: ${createError?.message ?? 'no user returned'}`);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError || !sessionData?.user) {
    throw new Error(`[auth] signIn failed: ${signInError?.message ?? 'unknown'}`);
  }

  const userId = sessionData.user.id;
  const { error: ensureError } = await userClient.rpc('ensure_public_user_row', {
    p_user: userId,
    p_email: email,
    p_full_name: `${label} Tester`,
  });
  if (ensureError) {
    throw new Error(`[rpc] ensure_public_user_row failed: ${ensureError.message}`);
  }

  await ensureProfile(userId, `${label} Tester`, email);

  const userRecord = { id: userId, email, client: userClient, label };
  state.users.push(userRecord);
  return userRecord;
};

const deleteUsers = async () => {
  await Promise.all(
    state.users.map(async ({ id }) => {
      try {
        await service.auth.admin.deleteUser(id);
      } catch (error) {
        console.warn(`[cleanup] deleteUser ${id} failed`, error.message);
      }
    }),
  );
};

const fetchTraitIds = async () => {
  const { data, error } = await anon.from('traits').select('id').limit(5);
  if (error || !data?.length) {
    throw new Error(`[traits] catalog fetch failed: ${error?.message ?? 'no rows returned'}`);
  }
  if (data.length < 2) {
    throw new Error('Need at least two traits in the catalog to run verification');
  }
  state.traitIds = data.map((row) => row.id);
};

const createSession = async ({ hostUserId, startsAt, endsAt }) => {
  const payload = {
    host_user_id: hostUserId,
    starts_at: iso(startsAt),
    ends_at: iso(endsAt),
    max_attendees: 25,
    price_cents: 0,
    visibility: 'friends',
    description: 'Trait policy verification session',
  };
  const { data, error } = await service.from('sessions').insert(payload).select('id').single();
  if (error || !data) {
    throw new Error(`[sessions] insert failed: ${error?.message ?? 'insert returned no row'}`);
  }
  state.sessions.push(data.id);
  return data.id;
};

const maybeInsertLegacyRsvp = async (sessionId, userId, status) => {
  const { error } = await service.from('rsvps').insert({ session_id: sessionId, user_id: userId, status });
  if (error && !/rsvps|duplicate key/.test(error.message)) {
    throw new Error(`[rsvps] insert failed: ${error.message}`);
  }
};

const addAttendee = async (sessionId, userId, status = 'going', overrides = {}) => {
  const payload = { session_id: sessionId, user_id: userId, status, ...overrides };
  const { error } = await service
    .from('session_attendees')
    .upsert(payload, { onConflict: 'session_id,user_id' });
  if (error) throw new Error(`[session_attendees] upsert failed: ${error.message}`);
  await maybeInsertLegacyRsvp(sessionId, userId, status);
};

const cleanupTables = async () => {
  const safeDelete = async (table, column, values) => {
    if (!values.length) return;
    try {
      await service.from(table).delete().in(column, values);
    } catch (error) {
      console.warn(`[cleanup] ${table} delete failed`, error.message);
    }
  };

  await safeDelete('user_trait_votes', 'session_id', state.sessions);
  await safeDelete('session_attendees', 'session_id', state.sessions);
  await safeDelete('sessions', 'id', state.sessions);

  if (state.sessions.length) {
    try {
      await service.from('rsvps').delete().in('session_id', state.sessions);
    } catch (error) {
      if (!/rsvps/.test(error.message)) {
        console.warn('[cleanup] rsvps delete failed', error.message);
      }
    }
  }

  const userIds = state.users.map((user) => user.id);
  await safeDelete('user_base_traits', 'user_id', userIds);

  const summaryPairs = Array.from(state.summaryTargets);
  for (const pair of summaryPairs) {
    const [userId, traitId] = pair.split('::');
    try {
      await service
        .from('user_trait_summary')
        .delete()
        .eq('user_id', userId)
        .eq('trait_id', traitId);
    } catch (error) {
      console.warn('[cleanup] user_trait_summary delete failed', error.message);
    }
  }

  await safeDelete('traits', 'id', state.insertedTraitIds);
};

const summaryKey = (userId, traitId) => `${userId}::${traitId}`;

const debugSessionState = async (label, sessionId, voter, recipient) => {
  if (!keepData) return;
  console.log(`\n[trait-policies][debug] ${label} session ${sessionId}`);
  const { data: sessionRow, error: sessionError } = await service
    .from('sessions')
    .select('starts_at, ends_at, visibility')
    .eq('id', sessionId)
    .single();
  if (sessionError) {
    console.log('  [debug] session fetch error', sessionError.message);
  } else {
    console.log('  [debug] session window', sessionRow.starts_at, '→', sessionRow.ends_at, 'visibility', sessionRow.visibility);
  }

  const { data: attendeeRows } = await service
    .from('session_attendees')
    .select('user_id, status, checked_in, attended_at, attendance_status')
    .eq('session_id', sessionId);
  console.log('  [debug] session_attendees', attendeeRows);

  const { data: voterAttendees, error: voterAttendeesError } = await voter.client
    .from('session_attendees')
    .select('session_id, user_id, status, attendance_status')
    .eq('session_id', sessionId);
  console.log('  [debug] voter-visible session_attendees', voterAttendees, voterAttendeesError?.message ?? null);

  const { data: recipientAttendees, error: recipientAttendeesError } = await recipient.client
    .from('session_attendees')
    .select('session_id, user_id, status, attendance_status')
    .eq('session_id', sessionId);
  console.log('  [debug] recipient-visible session_attendees', recipientAttendees, recipientAttendeesError?.message ?? null);

  const { data: rsvpRows } = await service
    .from('rsvps')
    .select('user_id, status')
    .eq('session_id', sessionId);
  console.log('  [debug] rsvps', rsvpRows);

  const { data: voterRsvps, error: voterRsvpsError } = await voter.client
    .from('rsvps')
    .select('session_id, user_id, status')
    .eq('session_id', sessionId);
  console.log('  [debug] voter-visible rsvps', voterRsvps, voterRsvpsError?.message ?? null);

  const { data: recipientRsvps, error: recipientRsvpsError } = await recipient.client
    .from('rsvps')
    .select('session_id, user_id, status')
    .eq('session_id', sessionId);
  console.log('  [debug] recipient-visible rsvps', recipientRsvps, recipientRsvpsError?.message ?? null);
};

const main = async () => {
  const now = new Date();
  await fetchTraitIds();

  const userA = await createTestUser('UserA');
  const userB = await createTestUser('UserB');
  const userC = await createTestUser('UserC');

  await step('anonymous users can read the trait catalog', async () => {
    const { data, error } = await anon.from('traits').select('id').limit(1);
    if (error || !data?.length) throw new Error(error?.message ?? 'no rows');
  });

  await step('anonymous users cannot insert into the trait catalog', async () => {
    const { error } = await anon.from('traits').insert({ name: `AnonTrait-${randomUUID()}`, color: '#ffffff', icon: 'Sparkles' });
    if (!error) throw new Error('expected RLS rejection');
  });

  await step('service role can insert traits', async () => {
    const traitName = `ServiceTrait-${randomUUID()}`;
    const { data, error } = await service.from('traits').insert({ name: traitName, color: '#111111', icon: 'ShieldCheck' }).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'no trait row returned');
    state.insertedTraitIds.push(data.id);
  });

  await service.from('user_base_traits').delete().eq('user_id', userA.id);
  await service.from('user_base_traits').delete().eq('user_id', userB.id);

  await step('users can store their own base traits', async () => {
    const { error } = await userA.client.from('user_base_traits').insert({ user_id: userA.id, trait_id: state.traitIds[0] });
    if (error) throw new Error(error.message);
  });

  await step('other users cannot read private base traits', async () => {
    const { data, error } = await userB.client.from('user_base_traits').select('trait_id').eq('user_id', userA.id);
    if (error) throw new Error(error.message);
    if (data.length !== 0) throw new Error('expected zero rows');
  });

  await step('users cannot insert base traits for someone else', async () => {
    const { error } = await userA.client.from('user_base_traits').insert({ user_id: userB.id, trait_id: state.traitIds[1] });
    if (!error) throw new Error('expected rejection');
  });

  await step('anonymous role cannot mutate base traits', async () => {
    const { error } = await anon.from('user_base_traits').insert({ user_id: userA.id, trait_id: state.traitIds[1] });
    if (!error) throw new Error('expected rejection');
  });

  const pastEnds = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const pastStarts = new Date(pastEnds.getTime() - 60 * 60 * 1000);
  const sessionFinished = await createSession({ hostUserId: userA.id, startsAt: pastStarts, endsAt: pastEnds });
  const finishedOverrides = {
    checked_in: true,
    attended_at: iso(pastEnds),
    attendance_status: 'attended',
  };
  await addAttendee(sessionFinished, userA.id, 'going', finishedOverrides);
  await addAttendee(sessionFinished, userB.id, 'going', finishedOverrides);

  await step('users can vote for traits after a finished session with mutual attendance', async () => {
    await debugSessionState('finished', sessionFinished, userA, userB);
    const { error } = await userA.client.from('user_trait_votes').insert({
      session_id: sessionFinished,
      from_user: userA.id,
      to_user: userB.id,
      trait_id: state.traitIds[0],
    });
    if (error) throw new Error(error.message);
    state.votes.push({ sessionId: sessionFinished, from: userA.id, to: userB.id });
  });

  const sessionFutureStarts = new Date(now.getTime() + 60 * 60 * 1000);
  const sessionFutureEnds = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const sessionFuture = await createSession({ hostUserId: userA.id, startsAt: sessionFutureStarts, endsAt: sessionFutureEnds });
  await addAttendee(sessionFuture, userA.id);
  await addAttendee(sessionFuture, userB.id);

  await step('votes are rejected if the session has not ended', async () => {
    const { error } = await userA.client.from('user_trait_votes').insert({
      session_id: sessionFuture,
      from_user: userA.id,
      to_user: userB.id,
      trait_id: state.traitIds[1],
    });
    if (!error) throw new Error('expected policy rejection for unfinished session');
  });

  const sessionMissingAttendanceEnds = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const sessionMissingAttendanceStarts = new Date(sessionMissingAttendanceEnds.getTime() - 60 * 60 * 1000);
  const sessionMissingAttendance = await createSession({ hostUserId: userA.id, startsAt: sessionMissingAttendanceStarts, endsAt: sessionMissingAttendanceEnds });
  await addAttendee(sessionMissingAttendance, userA.id);

  await step('votes require both parties to be marked going', async () => {
    const { error } = await userA.client.from('user_trait_votes').insert({
      session_id: sessionMissingAttendance,
      from_user: userA.id,
      to_user: userB.id,
      trait_id: state.traitIds[1],
    });
    if (!error) throw new Error('expected rejection because to_user lacks attendance');
  });

  await step('users cannot view votes they are not part of', async () => {
    const { data, error } = await userC.client.from('user_trait_votes').select('id').eq('session_id', sessionFinished);
    if (error) throw new Error(error.message);
    if (data.length !== 0) throw new Error('expected zero visible rows');
  });

  await service
    .from('user_trait_summary')
    .delete()
    .eq('user_id', userA.id)
    .eq('trait_id', state.traitIds[0]);
  state.summaryTargets.add(summaryKey(userA.id, state.traitIds[0]));

  await step('increment_user_trait_score RPC updates the summary table', async () => {
    const rpc = await userA.client.rpc('increment_user_trait_score', {
      p_user: userA.id,
      p_trait: state.traitIds[0],
      p_score_delta: 3,
      p_vote_delta: 2,
      p_base_delta: 1,
    });
    if (rpc.error) throw new Error(rpc.error.message);

    const { data, error } = await anon
      .from('user_trait_summary')
      .select('score, vote_count, base_count')
      .eq('user_id', userA.id)
      .eq('trait_id', state.traitIds[0])
      .single();
    if (error) throw new Error(error.message);
    if (data.score !== 3 || data.vote_count !== 2 || data.base_count !== 1) {
      throw new Error(`unexpected summary values ${JSON.stringify(data)}`);
    }
  });

  await step('anonymous callers cannot invoke increment_user_trait_score', async () => {
    const rpc = await anon.rpc('increment_user_trait_score', {
      p_user: userA.id,
      p_trait: state.traitIds[0],
      p_score_delta: 1,
      p_vote_delta: 0,
      p_base_delta: 0,
    });
    if (!rpc.error) throw new Error('expected RPC rejection for anonymous caller');
  });

  if (keepData) {
    console.log('[trait-policies] TRAIT_HEALTH_KEEP_DATA set; skipping cleanup for inspection.');
  } else {
    await cleanupTables();
    await deleteUsers();
  }

  if (failures.length) {
    console.error('\nTrait policy verification failed:');
    failures.forEach(({ label, error }) => {
      console.error(` • ${label}: ${error.message}`);
    });
    process.exit(1);
  }

  console.log('\nAll trait policy checks passed.');
};

main().catch(async (error) => {
  console.error('\nUnexpected error during trait policy verification:', error);
  failures.push({ label: 'runtime', error });
  if (keepData) {
    console.log('[trait-policies] TRAIT_HEALTH_KEEP_DATA set; leaving temporary rows in place for debugging.');
  } else {
    try {
      await cleanupTables();
      await deleteUsers();
    } catch (cleanupError) {
      console.warn('[cleanup] secondary failure', cleanupError.message);
    }
  }
  process.exit(1);
});
