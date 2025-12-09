import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, InteractionManager, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { REQUIRED_BASE_TRAITS } from '@dowhat/shared';
import AuthButtons from './AuthButtons';

type ProfileRow = {
  id: string;
  username: string | null;
  birthday: string | null;
  contact_email?: string | null;
  social_handle?: string | null;
  is_public?: boolean | null;
  bio?: string | null;
  onboarding_complete?: boolean | null;
};

type AuthGateProps = {
  children: ReactNode;
};

type ProfileDraft = {
  username: string;
  birthday: string;
  contactEmail: string;
  socialHandle: string;
  isPublic: boolean;
  bio: string;
};

const deferNavigation = (navigate: () => void) => {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      try {
        navigate();
      } catch (error) {
        if (__DEV__) {
          console.warn('[AuthGate] deferred navigation failed', error);
        }
      }
    });
  });
};

const normaliseDate = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})[-/. ]?(\d{2})[-/. ]?(\d{2})$/);
  if (!match) return trimmed;
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const isValidDate = (value: string): boolean => {
  if (!value) return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  return true;
};

const getMetadataValue = (metadata: Record<string, unknown> | undefined, key: string): string => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : '';
};

const getMetadataString = (metadata: Record<string, unknown> | undefined, keys: string[]): string | null => {
  for (const key of keys) {
    const value = getMetadataValue(metadata, key);
    if (value) return value;
  }
  return null;
};

const isForeignKeyMissingUser = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code : null;
  const message = typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  if (code !== '23503') return false;
  return /profiles?_id_fkey/i.test(message) || /profiles?_id_fkey/i.test(details) || /table "users"/i.test(details);
};

const isRowLevelSecurityError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof record.code === 'string' ? record.code : null;
  const message = typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  if (code && code !== '42501') return false;
  return /row[- ]level security/i.test(message) || /row[- ]level security/i.test(details) || code === '42501';
};

const ensurePublicUserRowViaRpc = async (session: Session, email: string | undefined, name: string | null) => {
  const { error } = await supabase.rpc('ensure_public_user_row', {
    p_user: session.user.id,
    p_email: email ?? null,
    p_full_name: name ?? null,
  });
  if (error) {
    if (__DEV__) console.warn('[AuthGate] ensure_public_user_row RPC failed', error);
    return false;
  }
  return true;
};

const ensureAppUserRow = async (session: Session, fallbackEmail?: string): Promise<boolean> => {
  const metadata = session.user.user_metadata ?? {};
  const resolvedEmail = session.user.email || fallbackEmail?.trim();
  if (!resolvedEmail) {
    return false;
  }
  const resolvedName =
    getMetadataString(metadata, ['full_name', 'name', 'given_name']) ||
    (typeof session.user.user_metadata?.preferred_username === 'string' ? session.user.user_metadata.preferred_username : null);

  const { error } = await supabase
    .from('users')
    .upsert(
      {
        id: session.user.id,
        email: resolvedEmail,
        full_name: resolvedName,
      },
      { onConflict: 'id' },
    );

  if (error) {
    if (isRowLevelSecurityError(error)) {
      const ensured = await ensurePublicUserRowViaRpc(session, resolvedEmail, resolvedName);
      if (ensured) {
        return true;
      }
    }
    if (__DEV__) console.warn('[AuthGate] ensureAppUserRow failed', error);
    return false;
  }
  return true;
};

const hasCompletedBaseTraits = async (userId: string): Promise<boolean> => {
  try {
    const { count, error } = await supabase
      .from('user_base_traits')
      .select('trait_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return (count ?? 0) >= REQUIRED_BASE_TRAITS;
  } catch (error) {
    if (__DEV__) {
      console.warn('[AuthGate] base trait check failed', error);
    }
    return false;
  }
};

function deriveDraft(session: Session, profile: ProfileRow | null): ProfileDraft {
  const metadata = session.user?.user_metadata ?? {};
  const email = session.user?.email ?? '';
  const suggestedUsername = getMetadataValue(metadata, 'username_suggestion') || getMetadataValue(metadata, 'preferred_username');
  const metadataBio = getMetadataValue(metadata, 'interests');
  const metadataContact = getMetadataValue(metadata, 'contact_email');

  let username = profile?.username ?? suggestedUsername ?? '';
  if (!username && email) {
    const base = email.split('@')[0] ?? email;
    username = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  }
  return {
    username,
    birthday: profile?.birthday ? normaliseDate(profile.birthday) : '',
    contactEmail: (profile?.contact_email ?? metadataContact) || email || '',
    socialHandle: profile?.social_handle ?? '',
    isPublic: profile?.is_public ?? true,
    bio: profile?.bio ?? metadataBio ?? '',
  };
}

function SignInScreen() {
  return (
    <LinearGradient
      colors={['#eef2ff', '#f8fafc']}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: '#FFFFFFEE',
          borderRadius: 30,
          padding: 32,
          gap: 22,
          shadowColor: '#0f172a',
          shadowOpacity: 0.15,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 16 },
          elevation: 10,
          borderWidth: 1,
          borderColor: '#e0e7ff',
        }}
      >
        <Text style={{ color: '#0F172A', fontSize: 30, fontWeight: '800', textAlign: 'center' }}>Welcome to doWhat</Text>
        <Text style={{ color: '#475569', textAlign: 'center', lineHeight: 20 }}>
          Sign in to find events around you, connect with others, and organise your next activity.
        </Text>
        <View style={{ padding: 20, backgroundColor: '#F8FAFC', borderRadius: 22, gap: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            Continue to your account
          </Text>
          <AuthButtons />
        </View>
      </View>
    </LinearGradient>
  );
}

type ProfileSetupProps = {
  session: Session;
  profile: ProfileRow | null;
  onComplete: (nextRoute?: string) => void;
};

function ProfileSetup({ session, profile, onComplete }: ProfileSetupProps) {
  const [username, setUsername] = useState('');
  const [birthday, setBirthday] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const seed = deriveDraft(session, profile);
    setUsername(seed.username);
    setBirthday(seed.birthday);
    setContactEmail(seed.contactEmail);
    setSocialHandle(seed.socialHandle);
    setIsPublic(seed.isPublic);
    setBio(seed.bio);
  }, [session, profile]);

  const submit = useCallback(async () => {
    const cleanUsername = username.trim();
    const cleanBio = bio.trim();
    const cleanBirthday = normaliseDate(birthday);
    const uniqueErrors: string[] = [];
    if (cleanUsername.length < 3) uniqueErrors.push('Choose a username with at least 3 characters.');
    if (cleanUsername.length > 24) uniqueErrors.push('Usernames must be 24 characters or fewer.');
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) uniqueErrors.push('Usernames can only include letters, numbers, and underscores.');
    if (!isValidDate(cleanBirthday)) uniqueErrors.push('Enter your birthday in YYYY-MM-DD format.');
    if (cleanBio.length < 10) uniqueErrors.push('Add a short introduction (at least 10 characters).');
    if (uniqueErrors.length > 0) {
      setError(uniqueErrors.join('\n'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureAppUserRow(session, contactEmail);
      const basePayload = {
        id: session.user.id,
        username: cleanUsername,
        birthday: cleanBirthday,
        contact_email: contactEmail.trim() ? contactEmail.trim() : null,
        social_handle: socialHandle.trim() ? socialHandle.trim() : null,
        is_public: isPublic,
        bio: cleanBio,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      } satisfies Record<string, unknown>;

      let { error: upsertError } = await supabase.from('profiles').upsert(basePayload, { onConflict: 'id' });

      if (upsertError && isForeignKeyMissingUser(upsertError)) {
        const ensured = await ensureAppUserRow(session, contactEmail);
        if (ensured) {
          const retry = await supabase.from('profiles').upsert(basePayload, { onConflict: 'id' });
          upsertError = retry.error ?? null;
        }
      }

      if (upsertError) throw upsertError;
      const needsTraits = !(await hasCompletedBaseTraits(session.user.id));
      onComplete(needsTraits ? '/onboarding-traits' : undefined);
    } catch (err) {
      console.error('[AuthGate] profile upsert failed', err);
      let message = 'Unable to save your profile right now.';
      if (err && typeof err === 'object') {
        const maybeMessage = (err as { message?: unknown }).message;
        if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
          message = maybeMessage;
        }
      } else if (typeof err === 'string' && err.trim()) {
        message = err;
      }

      if (/username/.test(message) && /duplicate/.test(message)) {
        setError('That username is already taken. Try another one.');
      } else if (/column\s+"?(username|birthday|contact_email|social_handle|is_public|onboarding_complete)"?/i.test(message)) {
        setError('Profiles table is missing the onboarding fields. Run migration 012_profile_onboarding.sql against your Supabase database and try again.');
      } else if (/permission denied/i.test(message)) {
        setError('Permission denied while saving profile. Ensure RLS on public.profiles lets users upsert their own row.');
      } else {
        setError(message || 'Unable to save your profile right now.');
      }
    } finally {
      setBusy(false);
    }
  }, [username, birthday, contactEmail, socialHandle, isPublic, bio, session, profile, onComplete]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      Alert.alert('Sign out failed', signOutError.message);
    }
  }, []);

  const displayEmail = session.user.email ?? contactEmail;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F1F5F9' }}
      contentContainerStyle={{ padding: 28, alignItems: 'center', justifyContent: 'center', minHeight: '100%' }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: 480, backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, gap: 22, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 }}>
        <Text style={{ color: '#0F172A', fontSize: 26, fontWeight: '800' }}>Complete your profile</Text>
        <Text style={{ color: '#475569', lineHeight: 20 }}>
          Tell the community a little about yourself. You can update these settings later in your profile.
        </Text>
        <Text style={{ color: '#0F172A', backgroundColor: '#E0F2FE', borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 18 }}>
          After you save, we'll guide you through choosing up to five personality traits so people can recognise your vibe.
        </Text>
        <View style={{ padding: 18, borderRadius: 18, backgroundColor: '#F8FAFC', gap: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ color: '#64748B', fontSize: 14 }}>Signed in as</Text>
          <Text style={{ color: '#0F172A', fontWeight: '700' }}>{displayEmail || 'Unknown user'}</Text>
          <Pressable onPress={signOut} style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#DC2626', backgroundColor: '#FEF2F2' }}>
            <Text style={{ color: '#B91C1C', fontWeight: '600' }}>Switch account</Text>
          </Pressable>
        </View>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#0F172A', fontWeight: '600' }}>Username</Text>
            <TextInput
              value={username}
              onChangeText={(value) => setUsername(value.replace(/\s+/g, ''))}
              placeholder="choose-a-username"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5F5' }}
            />
            <Text style={{ color: '#64748B', fontSize: 12 }}>
              Your username is public and helps friends find you.
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#0F172A', fontWeight: '600' }}>Birthday</Text>
            <TextInput
              value={birthday}
              onChangeText={(value) => setBirthday(normaliseDate(value))}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5F5' }}
            />
            <Text style={{ color: '#64748B', fontSize: 12 }}>
              We use your birthday to recommend age-appropriate activities. It is not shared publicly.
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#0F172A', fontWeight: '600' }}>Contact email (optional)</Text>
            <TextInput
              value={contactEmail}
              onChangeText={setContactEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="hello@example.com"
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5F5' }}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#0F172A', fontWeight: '600' }}>Social handle (optional)</Text>
            <TextInput
              value={socialHandle}
              onChangeText={setSocialHandle}
              autoCapitalize="none"
              placeholder="@dowhat"
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5F5' }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ color: '#0F172A', fontWeight: '600', marginBottom: 4 }}>Profile visibility</Text>
              <Text style={{ color: '#64748B', fontSize: 12 }}>
                {isPublic ? 'Others can view your profile details.' : 'Only you can view your profile details.'}
              </Text>
            </View>
            <Switch value={isPublic} onValueChange={setIsPublic} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#0F172A', fontWeight: '600' }}>Short bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              placeholder="Let others know what kind of activities you enjoy..."
              style={{ backgroundColor: '#F8FAFC', color: '#0F172A', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5F5', textAlignVertical: 'top', minHeight: 120 }}
            />
          </View>
          {error && (
            <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ color: '#B91C1C' }}>{error}</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{
            backgroundColor: busy ? '#93C5FD' : '#2563EB',
            borderRadius: 999,
            paddingVertical: 14,
            alignItems: 'center',
            shadowColor: '#2563EB',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: busy ? 0 : 3,
          }}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Save and continue</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function isProfileComplete(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  if (profile.onboarding_complete) return true;
  const hasUsername = Boolean(profile.username && profile.username.trim());
  const hasBirthday = Boolean(profile.birthday && isValidDate(normaliseDate(profile.birthday)));
  const hasBio = Boolean(profile.bio && profile.bio.trim().length >= 10);
  const hasVisibility = profile.is_public != null;
  return hasUsername && hasBirthday && hasBio && hasVisibility;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const sessionTokenRef = useRef<string | null>(null);
  const pendingRouteRef = useRef<string | null>(null);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const nextToken = nextSession?.access_token ?? null;
      const prevToken = sessionTokenRef.current;
      const tokenChanged = prevToken !== nextToken;

      setSession((prev) => {
        if (!tokenChanged && prevToken !== null) {
          return prev ?? nextSession;
        }
        return nextSession;
      });

      if (tokenChanged) {
        sessionTokenRef.current = nextToken;
        setProfileRevision((rev) => rev + 1);
      }
    },
    [setProfileRevision],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        applySession(data.session ?? null);
      } catch (error) {
        if (__DEV__) console.warn('[AuthGate] getSession failed', error);
        if (!active) return;
        applySession(null);
      } finally {
        if (active) setSessionLoading(false);
      }
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    const refreshSessionFromForeground = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          applySession(data.session ?? null);
        }
      } catch (error) {
        if (__DEV__) console.warn('[AuthGate] foreground session refresh failed', error);
      }
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshSessionFromForeground();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [applySession]);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfileLoading(false);
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      try {
        const baseColumns = ['id', 'username', 'birthday'] as const;
        const optionalColumns = ['contact_email', 'social_handle', 'is_public', 'bio', 'onboarding_complete'];

        const fetchProfile = async (columns: readonly string[]) =>
          supabase
            .from('profiles')
            .select(columns.join(', '))
            .eq('id', session.user.id)
            .maybeSingle<ProfileRow>();

        let remainingOptional = [...optionalColumns];
        let profileRow: ProfileRow | null = null;
        let lastError: unknown = null;

        while (true) {
          const { data, error } = await fetchProfile([...baseColumns, ...remainingOptional]);
          if (!error) {
            profileRow = data ?? null;
            lastError = null;
            break;
          }

          lastError = error;
          const message = (error as { message?: string } | null)?.message ?? '';
          const missingMatch = message.match(/column "?([\w.]+)"? does not exist/i);
          if (!missingMatch) break;
          const missingColumn = missingMatch[1]?.split('.').pop();
          if (!missingColumn || !remainingOptional.includes(missingColumn)) break;

          remainingOptional = remainingOptional.filter((column) => column !== missingColumn);

          if (remainingOptional.length === 0) {
            const { data: baseData, error: baseError } = await fetchProfile(baseColumns);
            if (!baseError) {
              profileRow = baseData ?? null;
              lastError = null;
            } else {
              lastError = baseError;
            }
            break;
          }
        }

        if (cancelled) return;

        if (lastError) {
          if (__DEV__) console.warn('[AuthGate] profile fetch error', lastError);
          setProfile(null);
        } else {
          setProfile(profileRow ?? null);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profileRevision]);

  const profileComplete = isProfileComplete(profile);

  const handleProfileComplete = useCallback(
    (nextRoute?: string) => {
      if (nextRoute) {
        pendingRouteRef.current = nextRoute;
      }
      setProfileRevision((rev) => rev + 1);
    },
    [],
  );

  useEffect(() => {
    if (!session || !profileComplete) return;
    const target = pendingRouteRef.current;
    if (!target) return;
    pendingRouteRef.current = null;
    deferNavigation(() => router.replace(target));
  }, [profileComplete, session]);

  if (sessionLoading || profileLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={{ color: '#e2e8f0', marginTop: 16 }}>Preparing your experience…</Text>
      </View>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (!profileComplete) {
    return <ProfileSetup session={session} profile={profile} onComplete={handleProfileComplete} />;
  }

  return <>{children}</>;
}
