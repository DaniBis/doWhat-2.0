import React, { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";

const PLEDGE_VERSION = "v1";

const COMMITMENTS = [
  {
    id: "confirm-attendance",
    title: "Confirm attendance early",
    description: "Update your status at least 12 hours before go-time so hosts can backfill your spot if plans change.",
  },
  {
    id: "arrive-on-time",
    title: "Arrive on time",
    description: "Give your group a reliable warm-up by aiming to arrive 10 minutes before the session start time.",
  },
  {
    id: "release-spot",
    title: "Release your spot",
    description: "Late cancels hurt rec play. If you can’t make it, free the slot immediately so someone else can jump in.",
  },
  {
    id: "respect-crew",
    title: "Respect every crew",
    description: "Keep games safe, supportive, and positive – doWhat only works when everyone feels welcome.",
  },
] as const;

type CommitmentState = Record<(typeof COMMITMENTS)[number]["id"], boolean>;

const buildCommitmentState = (value: boolean): CommitmentState => {
  return COMMITMENTS.reduce<CommitmentState>((acc, item) => {
    acc[item.id] = value;
    return acc;
  }, {} as CommitmentState);
};

const formatAckDate = (timestamp: string | null) => {
  if (!timestamp) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
  } catch (error) {
    return new Date(timestamp).toDateString();
  }
};

const ReliabilityPledgeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [commitmentState, setCommitmentState] = useState<CommitmentState>(() => buildCommitmentState(false));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackTimestamp, setAckTimestamp] = useState<string | null>(null);
  const [ackVersion, setAckVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!active) return;
        const user = auth?.user;
        if (!user) {
          setError("Please sign in to continue.");
          return;
        }
        setUserId(user.id);
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("reliability_pledge_ack_at, reliability_pledge_version")
          .eq("id", user.id)
          .maybeSingle<{ reliability_pledge_ack_at: string | null; reliability_pledge_version: string | null }>();
        if (!active) return;
        if (profileError && profileError.code !== "PGRST116") {
          throw profileError;
        }
        if (profileRow?.reliability_pledge_ack_at) {
          setCommitmentState(buildCommitmentState(true));
          setAckTimestamp(profileRow.reliability_pledge_ack_at);
          setAckVersion(profileRow.reliability_pledge_version);
        }
      } catch (err) {
        console.error("[reliability-pledge] hydrate failed", err);
        if (active) setError("Could not load your pledge state. Try again in a moment.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const toggleCommitment = useCallback((id: keyof CommitmentState) => {
    setError(null);
    setCommitmentState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const allConfirmed = useMemo(() => COMMITMENTS.every((commitment) => commitmentState[commitment.id]), [commitmentState]);

  const handleAccept = useCallback(async () => {
    if (!userId) {
      setError("Please sign in to continue.");
      return;
    }
    if (!allConfirmed) {
      setError("Agree to every commitment to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const timestamp = new Date().toISOString();
      const profilePayload = {
        id: userId,
        user_id: userId,
        reliability_pledge_ack_at: timestamp,
        reliability_pledge_version: PLEDGE_VERSION,
        updated_at: timestamp,
      } as const;
      let { error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });
      if (
        profileError &&
        profileError.code === "23502" &&
        /user_id/i.test(`${profileError.message ?? ""} ${profileError.details ?? ""}`)
      ) {
        const { error: repairError } = await supabase
          .from("profiles")
          .update({ user_id: userId, updated_at: timestamp })
          .eq("id", userId);
        if (!repairError) {
          const retry = await supabase
            .from("profiles")
            .upsert(profilePayload, { onConflict: "id" });
          profileError = retry.error ?? null;
        }
      }
      if (profileError) throw profileError;
      setAckTimestamp(timestamp);
      setAckVersion(PLEDGE_VERSION);
      router.replace("/(tabs)/home");
    } catch (err) {
      console.error("[reliability-pledge] save failed", err);
      setError("Could not save your pledge. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [allConfirmed, userId]);

  const ready = Boolean(userId && allConfirmed && !saving);
  const formattedAck = formatAckDate(ackTimestamp);

  return (
    <SafeAreaView
      style={[styles.safeArea, { paddingTop: insets.top || 24, paddingBottom: insets.bottom || 24 }]}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Reliability pledge</Text>
        <Text style={styles.description}>
          A doWhat session only works when everyone follows through. Lock in these commitments so hosts know they can count on you.
        </Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#0EA5E9" />
            <Text style={styles.loadingText}>Loading your pledge…</Text>
          </View>
        ) : (
          <View style={styles.commitmentStack}>
            {COMMITMENTS.map((commitment) => {
              const checked = commitmentState[commitment.id];
              return (
                <Pressable
                  key={commitment.id}
                  testID={`commitment-${commitment.id}`}
                  onPress={() => toggleCommitment(commitment.id)}
                  disabled={saving}
                  accessibilityRole="checkbox"
                  accessibilityLabel={commitment.title}
                  accessibilityState={{ checked }}
                  style={[styles.commitmentCard, checked && styles.commitmentCardActive]}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <View style={styles.commitmentCopy}>
                    <Text style={styles.commitmentTitle}>{commitment.title}</Text>
                    <Text style={styles.commitmentDescription}>{commitment.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {formattedAck ? (
          <Text style={styles.successText}>
            You accepted version {ackVersion ?? PLEDGE_VERSION} on {formattedAck}. Updating keeps your score fresh.
          </Text>
        ) : (
          <Text style={styles.helperText}>Select each commitment to enable the pledge button.</Text>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          testID="reliability-pledge-submit"
          onPress={handleAccept}
          disabled={!ready}
          style={[styles.saveButton, ready ? styles.saveButtonReady : styles.saveButtonDisabled]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Lock it in</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f8fafc",
  },
  description: {
    fontSize: 15,
    color: "#cbd5f5",
    lineHeight: 22,
  },
  loadingBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#94a3b8",
  },
  commitmentStack: {
    gap: 12,
  },
  commitmentCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
    padding: 16,
    alignItems: "flex-start",
  },
  commitmentCardActive: {
    borderColor: "#34d399",
    backgroundColor: "#052e16",
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: "#34d399",
    backgroundColor: "#34d399",
  },
  checkboxMark: {
    color: "#022c22",
    fontWeight: "700",
  },
  commitmentCopy: {
    flex: 1,
    gap: 6,
  },
  commitmentTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f8fafc",
  },
  commitmentDescription: {
    fontSize: 14,
    color: "#cbd5f5",
    lineHeight: 20,
  },
  helperText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  successText: {
    color: "#34d399",
    fontSize: 14,
  },
  errorText: {
    color: "#f87171",
  },
  saveButton: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonReady: {
    backgroundColor: "#10b981",
  },
  saveButtonDisabled: {
    backgroundColor: "#1e293b",
  },
  saveButtonText: {
    color: "#022c22",
    fontWeight: "700",
    fontSize: 16,
  },
});

export default ReliabilityPledgeScreen;
