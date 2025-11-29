import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { TraitSystemError, getUserTraitSummary } from "@/lib/trait-system";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { Database } from "@/types/database";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient<Database>();
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("top") ?? url.searchParams.get("limit") ?? "12";
  const parsedLimit = Number(limitParam);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

  let targetId = params.id;
  if (targetId === "me") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    targetId = user.id;
  }

  try {
    const traits = await getUserTraitSummary({ userId: targetId, limit }, supabase);
    return NextResponse.json(traits);
  } catch (error) {
    if (error instanceof TraitSystemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
