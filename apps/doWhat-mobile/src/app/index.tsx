import { useEffect, useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { supabase } from "../lib/supabase";
import type { ActivityRow } from "@dowhat/shared";
import { formatPrice, formatDateRange } from "@dowhat/shared";
import { Link } from "expo-router";
import AuthButtons from "../components/AuthButtons";

export default function Index() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, price_cents, starts_at, ends_at, activities(name), venues(name)")
        .order("starts_at", { ascending: true })
        .limit(20);

      if (error) setError(error.message);
      else setRows((data ?? []) as ActivityRow[]);
    })();
  }, []);

  if (error) {
    return <Text style={{ padding: 16, color: "red" }}>Error: {error}</Text>;
  }

  if (!rows.length) {
    return <Text style={{ padding: 16 }}>No sessions yet.</Text>;
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, gap: 12 }}
      data={rows}
      keyExtractor={(s) => String(s.id)}
      renderItem={({ item: s }) => (
        <View style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            {s.activities?.name ?? "Running"}
          </Text>
          <Text style={{ marginTop: 4 }}>{s.venues?.name ?? "Venue"}</Text>
          <Text style={{ marginTop: 4 }}>{formatPrice(s.price_cents)}</Text>
          <Text style={{ marginTop: 4 }}>
            {formatDateRange(s.starts_at, s.ends_at)}
          </Text>
          <Link href={`/sessions/${s.id}`} asChild>
            <Pressable style={{ marginTop: 12, padding: 10, backgroundColor: "#16a34a", borderRadius: 8 }}>
              <Text style={{ color: "white", textAlign: "center" }}>View details</Text>
            </Pressable>
          </Link>
        </View>
      )}
      ListHeaderComponent={
        <>
          <AuthButtons />
          <Link href="/nearby" asChild>
            <Pressable style={{ padding: 8, borderWidth: 1, borderRadius: 8, marginHorizontal: 12 }}>
              <Text style={{ textAlign: 'center' }}>Find nearby activities</Text>
            </Pressable>
          </Link>
        </>
      }
    />
  );
}
