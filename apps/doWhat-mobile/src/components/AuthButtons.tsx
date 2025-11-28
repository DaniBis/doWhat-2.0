import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Linking, Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { getDeepLinkParam } from '../lib/deepLinking';

type AuthSessionLike = {
  makeRedirectUri: (options?: { useProxy?: boolean; path?: string; scheme?: string }) => string;
  startAsync?: (config: { authUrl: string; returnUrl?: string }) => Promise<{ type: string; url?: string; params?: Record<string, string> }>;
};

const FALLBACK_SCHEME = 'dowhat';

const fallbackAuthSession: AuthSessionLike = {
  makeRedirectUri: ({ path, scheme } = {}) => {
    const resolvedScheme = scheme || FALLBACK_SCHEME;
    return path ? `${resolvedScheme}://${path}` : `${resolvedScheme}://auth-callback`;
  },
  startAsync: undefined,
};

let AuthSession: AuthSessionLike = fallbackAuthSession;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require('expo-auth-session');
  if (loaded && typeof loaded.makeRedirectUri === 'function') {
    AuthSession = loaded;
  }
} catch {
  console.warn('[auth] expo-auth-session not fully available; falling back to basic redirect');
}

type LinkingEvent = { url: string };

const extractQueryParam = (url: string, key: string): string | undefined => getDeepLinkParam(url, key);

function useSupabaseOAuthListener() {
  useEffect(() => {
    // Completes auth session on iOS after returning from SFSafariViewController
    try {
      WebBrowser.maybeCompleteAuthSession?.();
    } catch {}

    const handleURL = async (url: string) => {
      try {
        const code = extractQueryParam(url, 'code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (error) {
        if (__DEV__) console.warn('[auth] listener error', error);
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }: LinkingEvent) => handleURL(url));
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleURL(initialUrl);
    });
    return () => subscription.remove();
  }, []);
}

const initialSignupForm = {
  fullName: '',
  username: '',
  city: '',
  interests: '',
};

const MAX_PERSONALITY_TRAITS = 5;

const TRAIT_SUGGESTIONS = [
  'Adventurous',
  'Curious',
  'Empathetic',
  'Organised',
  'Playful',
  'Reliable',
  'Social',
  'Spontaneous',
  'Thoughtful',
  'Visionary',
];

const normaliseTraitLabel = (value: string): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  if (!/^[a-zA-Z][-a-zA-Z\s]+$/.test(trimmed)) return null;
  return trimmed
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export default function AuthButtons() {
  useSupabaseOAuthListener();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [signupStep, setSignupStep] = useState(0);
  const [signupForm, setSignupForm] = useState({ ...initialSignupForm });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [traits, setTraits] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState('');
  const [traitError, setTraitError] = useState<string | null>(null);

  const redirectTo = useMemo(() => {
    const scheme = (Constants?.expoConfig?.scheme as string | undefined) ?? FALLBACK_SCHEME;
    const appOwnership = Constants?.appOwnership ?? null;
    const shouldUseProxy = appOwnership === 'expo' && Platform.OS !== 'web';

    try {
      return AuthSession.makeRedirectUri({
        path: 'auth-callback',
        scheme,
        useProxy: shouldUseProxy,
      });
    } catch (error) {
      if (__DEV__) console.warn('[auth] makeRedirectUri failed, falling back', error);
      return `${scheme}://auth-callback`;
    }
  }, []);

  const startAuthFlow = useMemo(() => {
    return async (authUrl: string) => {
      if (!authUrl) return null;

      if (AuthSession.startAsync) {
        return AuthSession.startAsync({ authUrl, returnUrl: redirectTo });
      }

      if (WebBrowser.openAuthSessionAsync) {
        return WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      }

      await Linking.openURL(authUrl);
      return null;
    };
  }, [redirectTo]);

  const resendConfirmation = useCallback(async () => {
    if (!pendingConfirmationEmail) return;
    setResending(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: pendingConfirmationEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
      setInfo(`Sent another confirmation email to ${pendingConfirmationEmail}.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to resend confirmation email right now.');
    } finally {
      setResending(false);
    }
  }, [pendingConfirmationEmail, redirectTo]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setUserEmail(data.user?.email ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  async function signIn() {
    setErr(null);
    setInfo(null);
    setPendingConfirmationEmail(null);
    setBusy(true);
    try {
      if (__DEV__) console.log('[auth] redirectTo', redirectTo);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (__DEV__) console.log('[auth] signInWithOAuth error?', error?.message);
      if (__DEV__) console.log('[auth] supabase auth url', data?.url);
      if (error) {
        throw error;
      }
      if (!data?.url) {
        throw new Error('Unable to start Google sign-in.');
      }

      const result = await startAuthFlow(data.url);
      if (__DEV__) console.log('[auth] auth result', result);
      if (!result || typeof result !== 'object') {
        return;
      }

      if ('type' in result && result.type && result.type !== 'success') {
        if (__DEV__) console.log('[auth] auth flow ended with', result.type);
        return;
      }

      const paramsFromResult = 'params' in result ? result.params ?? {} : {};
      const errorMessage = paramsFromResult?.error_description || paramsFromResult?.error;
      if (errorMessage) {
        setErr(errorMessage);
        return;
      }

      const directCode = paramsFromResult?.code;
      const directAccessToken = paramsFromResult?.access_token;
      const directRefreshToken = paramsFromResult?.refresh_token;
      if (directCode) {
        await supabase.auth.exchangeCodeForSession(directCode);
        setErr(null);
        return;
      }
      if (directAccessToken) {
        await supabase.auth.setSession({ access_token: directAccessToken, refresh_token: directRefreshToken ?? '' });
        setErr(null);
        return;
      }

      const url = 'url' in result && typeof result.url === 'string' ? result.url : undefined;
      if (!url) {
        setErr('Google sign-in did not return a session.');
        return;
      }

      const fragment = url.split('#')[1] || '';
      const query = url.split('?')[1] || '';
      const params = new URLSearchParams(fragment || query);
      const code = params.get('code') || undefined;
      const accessToken = params.get('access_token') || undefined;
      const refreshToken = params.get('refresh_token') || undefined;
      const paramError = params.get('error') || params.get('error_description');

      if (paramError) {
        setErr(paramError);
        return;
      }

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        setErr(null);
        return;
      }
      if (accessToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' });
        setErr(null);
        return;
      }

      setErr('Google sign-in was cancelled before completion.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      if (__DEV__) console.warn('[auth] signIn error', message, error);
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setErr(null);
    setInfo(null);
    setPendingConfirmationEmail(null);
  }

  const totalSignupSteps = 4;

  const resetSignupFlow = useCallback(() => {
    setSignupStep(0);
    setSignupForm({ ...initialSignupForm });
    setTraits([]);
    setTraitInput('');
    setTraitError(null);
  }, []);

  const setIntent = useCallback(
    (nextIsSignup: boolean) => {
      setIsSignup(nextIsSignup);
      setErr(null);
      setInfo(null);
      setPendingConfirmationEmail(null);
      if (!nextIsSignup) {
        resetSignupFlow();
      }
    },
    [resetSignupFlow],
  );

  const updateSignupField = useCallback((key: keyof typeof initialSignupForm, value: string) => {
    setSignupForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addTrait = useCallback(
    (raw: string) => {
      const normalised = normaliseTraitLabel(raw);
      if (!normalised) {
        setTraitError('Traits should be 2-20 letters and only include alphabetic characters.');
        return;
      }
      if (traits.some((trait) => trait.toLowerCase() === normalised.toLowerCase())) {
        setTraitError('You already added that trait.');
        return;
      }
      if (traits.length >= MAX_PERSONALITY_TRAITS) {
        setTraitError('You can add up to 5 traits.');
        return;
      }
      setTraits((prev) => [...prev, normalised]);
      setTraitInput('');
      setTraitError(null);
      setErr(null);
    },
    [traits],
  );

  const addTraitFromInput = useCallback(() => {
    if (!traitInput.trim()) {
      setTraitError('Type a trait before adding it.');
      return;
    }
    addTrait(traitInput);
  }, [addTrait, traitInput]);

  const removeTrait = useCallback((label: string) => {
    setTraits((prev) => prev.filter((trait) => trait !== label));
    setTraitError(null);
  }, []);

  const validateSignupStep = useCallback(
    (step: number): boolean => {
      if (!isSignup) return true;
      if (step === 0) {
        if (signupForm.fullName.trim().length < 2) {
          setErr('Add your name so people can recognise you.');
          return false;
        }
        if (signupForm.username.trim().length < 3) {
          setErr('Pick a username with at least 3 characters.');
          return false;
        }
      }
      if (step === 1) {
        if (signupForm.city.trim().length < 2) {
          setErr('Tell us the city you are active in.');
          return false;
        }
      }
      if (step === 2) {
        if (!traits.length) {
          setTraitError('Add at least one personality trait to help others get to know you.');
          setErr('Add at least one personality trait to help others get to know you.');
          return false;
        }
        setTraitError(null);
      }
      if (step === 3) {
        if (!email.trim()) {
          setErr('Email is required to create your account.');
          return false;
        }
        if (!password.trim()) {
          setErr('Create a password to secure your account.');
          return false;
        }
      }
      setErr(null);
      return true;
    },
    [email, isSignup, password, signupForm.city, signupForm.fullName, signupForm.username, traits],
  );

  const signInWithEmail = useCallback(async () => {
    if (isSignup) {
      if (!validateSignupStep(2)) return;
    } else if (!email.trim() || !password.trim()) {
      setErr('Email and password are required');
      return;
    }

    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (isSignup) {
        const metadata = {
          full_name: signupForm.fullName.trim(),
          username_suggestion: signupForm.username.trim(),
          preferred_city: signupForm.city.trim(),
          interests: signupForm.interests.trim(),
          personality_traits: traits,
        };
        const targetEmail = email.trim();
        const { data, error } = await supabase.auth.signUp({
          email: targetEmail,
          password,
          options: {
            data: metadata,
            emailRedirectTo: redirectTo,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo(`We sent a confirmation link to ${targetEmail}. Please verify your email to finish signing up.`);
          setPendingConfirmationEmail(targetEmail);
          setSignupStep(totalSignupSteps - 1);
          setEmailMode(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPendingConfirmationEmail(null);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'email_address_invalid') {
        setErr('Please use a valid email address (e.g., Gmail or your real provider).');
        return;
      }
      setErr(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }, [email, isSignup, password, redirectTo, setEmailMode, signupForm, totalSignupSteps, traits, validateSignupStep]);

  const handleSignupAdvance = useCallback(() => {
    if (!validateSignupStep(signupStep)) return;
    if (signupStep < totalSignupSteps - 1) {
      setSignupStep((prev) => prev + 1);
    } else {
      void signInWithEmail();
    }
  }, [signInWithEmail, signupStep, totalSignupSteps, validateSignupStep]);

  const handleSignupBack = useCallback(() => {
    setInfo(null);
    setPendingConfirmationEmail(null);
    setTraitError(null);
    if (signupStep === 0) {
      resetSignupFlow();
      setEmailMode(false);
      setErr(null);
      return;
    }
    setSignupStep((prev) => Math.max(0, prev - 1));
  }, [resetSignupFlow, setEmailMode, signupStep]);

  const renderSignupStep = () => {
    switch (signupStep) {
      case 0:
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Tell us about you</Text>
            <TextInput
              placeholder="Your name"
              value={signupForm.fullName}
              onChangeText={(value) => updateSignupField('fullName', value)}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' }}
            />
            <TextInput
              placeholder="Choose a username"
              autoCapitalize="none"
              value={signupForm.username}
              onChangeText={(value) => updateSignupField('username', value.replace(/\s+/g, ''))}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' }}
            />
          </View>
        );
      case 1:
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Where & what do you do?</Text>
            <TextInput
              placeholder="City you're usually in"
              value={signupForm.city}
              onChangeText={(value) => updateSignupField('city', value)}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' }}
            />
            <TextInput
              placeholder="Favourite activities (optional)"
              value={signupForm.interests}
              onChangeText={(value) => updateSignupField('interests', value)}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', minHeight: 80, textAlignVertical: 'top' }}
              multiline
            />
          </View>
        );
      case 2:
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Show your personality</Text>
            <Text style={{ color: '#475569', fontSize: 13 }}>
              Add up to {MAX_PERSONALITY_TRAITS} personality traits. Mix popular picks or type your own words to help others recognise your vibe.
            </Text>
            <TextInput
              placeholder="e.g. Adventurous"
              autoCapitalize="words"
              value={traitInput}
              onChangeText={(value) => {
                setTraitInput(value);
                if (traitError) setTraitError(null);
              }}
              onSubmitEditing={addTraitFromInput}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' }}
            />
            <Pressable
              onPress={addTraitFromInput}
              disabled={!traitInput.trim()}
              style={{
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: traitInput.trim() ? '#0f172a' : '#94a3b8',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#f8fafc', fontWeight: '600' }}>Add trait</Text>
            </Pressable>
            <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center' }}>{traits.length} / {MAX_PERSONALITY_TRAITS} added</Text>
            {traitError && <Text style={{ color: '#b45309', fontSize: 13, textAlign: 'center' }}>{traitError}</Text>}
            {traits.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {traits.map((trait) => (
                  <View
                    key={trait}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: '#e0f2fe',
                      borderWidth: 1,
                      borderColor: '#bae6fd',
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '600' }}>{trait}</Text>
                    <Pressable hitSlop={8} onPress={() => removeTrait(trait)}>
                      <Text style={{ color: '#0f172a', fontWeight: '700' }}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: '#94a3b8', fontSize: 13 }}>No traits yet. Add a quick word like "Curious" or "Organised".</Text>
            )}
            <View style={{ gap: 8 }}>
              <Text style={{ color: '#475569', fontSize: 13, fontWeight: '600' }}>Quick picks</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TRAIT_SUGGESTIONS.map((option) => {
                  const disabled = traits.length >= MAX_PERSONALITY_TRAITS || traits.some((trait) => trait.toLowerCase() === option.toLowerCase());
                  return (
                    <Pressable
                      key={option}
                      onPress={() => addTrait(option)}
                      disabled={disabled}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#cbd5f5',
                        backgroundColor: disabled ? '#f8fafc' : '#eef2ff',
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: '#0f172a', fontWeight: '500' }}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        );
      default:
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Create your account</Text>
            <Text style={{ color: '#475569', fontSize: 13 }}>We will send a confirmation link after you submit.</Text>
            <TextInput
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' }}
            />
            <TextInput
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' }}
            />
          </View>
        );
    }
  };

  const googleCtaLabel = isSignup ? 'Sign up with Google' : 'Sign in with Google';
  const emailToggleLabel = isSignup ? 'Use email to sign up' : 'Use email to sign in';
  const intentHelper = isSignup ? 'New here? Create your account.' : 'Already have an account? Sign in.';

  return (
    <View style={{ gap: 14 }}>
      {userEmail ? (
        <>
          <View style={{ gap: 4, alignItems: 'center' }}>
            <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600' }}>Signed in as</Text>
            <Text style={{ color: '#0f172a', fontSize: 16 }}>{userEmail}</Text>
          </View>
          <Pressable
            onPress={signOut}
            style={{
              marginTop: 6,
              alignSelf: 'center',
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#34d399',
              backgroundColor: '#ecfdf5',
            }}
          >
            <Text style={{ color: '#0d9488', fontWeight: '600' }}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 999, padding: 4 }}>
            <Pressable
              onPress={() => setIntent(false)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                alignItems: 'center',
                backgroundColor: !isSignup ? '#ffffff' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '600', color: !isSignup ? '#0f172a' : '#475569' }}>Sign in</Text>
            </Pressable>
            <Pressable
              onPress={() => setIntent(true)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 999,
                alignItems: 'center',
                backgroundColor: isSignup ? '#ffffff' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '600', color: isSignup ? '#0f172a' : '#475569' }}>Create account</Text>
            </Pressable>
          </View>
          <Text style={{ color: '#475569', textAlign: 'center', fontSize: 13 }}>{intentHelper}</Text>
          {!emailMode && (
            <View style={{ gap: 12 }}>
              <Pressable
                onPress={signIn}
                disabled={busy}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 16,
                  borderRadius: 18,
                  backgroundColor: '#0f172a',
                  shadowColor: '#0f172a',
                  shadowOpacity: 0.15,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 4,
                  opacity: busy ? 0.7 : 1,
                  gap: 12,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#f8fafc" />
                ) : (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: '#f8fafc',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f172a' }}>G</Text>
                  </View>
                )}
                <Text style={{ color: '#f1f5f9', fontSize: 16, fontWeight: '700' }}>{googleCtaLabel}</Text>
              </Pressable>

              {err && !emailMode && (
                <Text style={{ color: '#b91c1c', fontWeight: '500', textAlign: 'center' }}>{err}</Text>
              )}

              <Pressable
                onPress={() => {
                  setErr(null);
                  setEmailMode(true);
                  if (isSignup) {
                    resetSignupFlow();
                  }
                  setInfo(null);
                  setPendingConfirmationEmail(null);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 15,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#cbd5f5',
                  backgroundColor: '#f8fafc',
                }}
              >
                <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '600' }}>{emailToggleLabel}</Text>
              </Pressable>
            </View>
          )}
          {emailMode && !isSignup && (
            <View style={{ gap: 12, backgroundColor: '#f8fafc', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Sign in with email</Text>
              <TextInput
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' }}
              />
              <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' }}
              />
              {err && <Text style={{ color: '#b91c1c', fontWeight: '500', textAlign: 'center' }}>{err}</Text>}
              {info && <Text style={{ color: '#0f766e', fontWeight: '500', textAlign: 'center' }}>{info}</Text>}
              <Pressable
                onPress={signInWithEmail}
                disabled={busy}
                style={{ paddingVertical: 14, borderRadius: 16, backgroundColor: busy ? '#9ca3af' : '#10b981', alignItems: 'center' }}
              >
                {busy ? <ActivityIndicator color="#f8fafc" /> : <Text style={{ color: '#f8fafc', fontSize: 15, fontWeight: '700' }}>Sign in</Text>}
              </Pressable>
              <Pressable
                onPress={() => {
                  setErr(null);
                  setEmailMode(false);
                  setInfo(null);
                  setPendingConfirmationEmail(null);
                }}
              >
                <Text style={{ color: '#475569', textAlign: 'center', fontWeight: '500' }}>Back</Text>
              </Pressable>
            </View>
          )}
          {emailMode && isSignup && (
            <View style={{ gap: 16, backgroundColor: '#f8fafc', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                {Array.from({ length: totalSignupSteps }).map((_, index) => (
                  <View
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: index === signupStep ? '#0f172a' : '#cbd5f5',
                    }}
                  />
                ))}
              </View>
              {renderSignupStep()}
              {err && <Text style={{ color: '#b91c1c', fontWeight: '500', textAlign: 'center' }}>{err}</Text>}
              {info && (
                <View style={{ gap: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#0f766e', fontWeight: '500', textAlign: 'center' }}>{info}</Text>
                  {pendingConfirmationEmail && (
                    <Pressable
                      onPress={resendConfirmation}
                      disabled={resending}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 18,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: '#0f766e',
                        backgroundColor: resending ? '#ccfbf1' : '#f0fdfa',
                      }}
                    >
                      {resending ? (
                        <ActivityIndicator color="#0f766e" />
                      ) : (
                        <Text style={{ color: '#0f766e', fontWeight: '600' }}>Resend email</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Pressable
                  onPress={handleSignupBack}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5f5', backgroundColor: '#fff', alignItems: 'center' }}
                >
                  <Text style={{ color: '#0f172a', fontWeight: '600' }}>{signupStep === 0 ? 'Cancel' : 'Back'}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSignupAdvance}
                  disabled={busy}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: busy ? '#9ca3af' : '#10b981', alignItems: 'center' }}
                >
                  {busy ? (
                    <ActivityIndicator color="#f8fafc" />
                  ) : (
                    <Text style={{ color: '#f8fafc', fontWeight: '700' }}>{signupStep === totalSignupSteps - 1 ? 'Send confirmation' : 'Next'}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
