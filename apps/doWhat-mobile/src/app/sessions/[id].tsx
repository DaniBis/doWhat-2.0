import { useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatDateRange, formatPrice } from "@dowhat/shared";

export default function SessionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("activities_view") // or "sessions" if you prefer
        .select("*")
        .eq("id", id)
        .single();

      if (error) setError(error.message);
      else setRow(data);
    })();
  }, [id]);

  if (error) return <Text style={{ padding: 16, color: "red" }}>Error: {error}</Text>;
  if (!row) return <Text style={{ padding: 16 }}>Loading…</Text>;

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>{row.activities?.name ?? "Activity"}</Text>
      <Text style={{ marginTop: 6 }}>{row.venues?.name ?? "Venue"}</Text>
      <Text style={{ marginTop: 6 }}>{formatPrice(row.price_cents)}</Text>
      <Text style={{ marginTop: 6 }}>{formatDateRange(row.starts_at, row.ends_at)}</Text>
    </View>
  );
}
