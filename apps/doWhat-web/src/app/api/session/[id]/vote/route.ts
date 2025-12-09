import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { TraitSystemError, recordTraitVotes } from "@/lib/trait-system";
import { traitVoteSchema } from "@/lib/validation/traits";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = traitVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await recordTraitVotes(
      { sessionId: params.id, fromUserId: user.id, votes: parsed.data.votes },
      supabase
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof TraitSystemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
