import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

type TraitRecord = {
  id: string;
  name: string | null;
  color?: string | null;
  icon?: string | null;
};

type SummaryRow = {
  trait_id: string;
  score: number;
  vote_count: number;
  base_count: number;
  traits: TraitRecord | TraitRecord[] | null;
};

type PopularTrait = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  score: number;
  voteCount: number;
  baseCount: number;
  popularity: number;
};

const clampLimit = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value) || !value) return fallback;
  const normalized = Math.floor(value);
  if (normalized < 1) return 1;
  if (normalized > 24) return 24;
  return normalized;
};

const normalizeTrait = (input: TraitRecord | TraitRecord[] | null): TraitRecord | null => {
  if (!input) return null;
  if (Array.isArray(input)) {
    return input[0] ?? null;
  }
  return input;
};

export async function GET(request: Request) {
  const supabase = createClient();
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? url.searchParams.get("top"));
  const limit = clampLimit(limitParam, 12);
  const sampleSize = Math.min(Math.max(limit * 10, 60), 500);

  try {
    const { data, error } = await supabase
      .from("user_trait_summary")
      .select("trait_id, score, vote_count, base_count, traits:trait_id(id, name, color, icon)")
      .order("score", { ascending: false })
      .limit(sampleSize);

    if (error) {
      throw error;
    }

    const aggregates = new Map<string, PopularTrait>();
    const rows = (data ?? []) as SummaryRow[];

    rows.forEach((row) => {
      const trait = normalizeTrait(row.traits);
      if (!trait?.id) return;
      const entry = aggregates.get(trait.id) ?? {
        id: trait.id,
        name: trait.name ?? "Unknown",
        color: trait.color ?? undefined,
        icon: trait.icon ?? undefined,
        score: 0,
        voteCount: 0,
        baseCount: 0,
        popularity: 0,
      };
      entry.score += row.score ?? 0;
      entry.voteCount += row.vote_count ?? 0;
      entry.baseCount += row.base_count ?? 0;
      entry.popularity = entry.score + entry.voteCount + entry.baseCount;
      aggregates.set(trait.id, entry);
    });

    const response = Array.from(aggregates.values())
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
