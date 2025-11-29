import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { TraitSystemError, saveOnboardingTraits } from "@/lib/trait-system";
import { onboardingTraitsSchema } from "@/lib/validation/traits";
import { getErrorMessage } from "@/lib/utils/getErrorMessage";
import type { Database } from "@/types/database";

export async function POST(req: Request) {
  const supabase = createClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = onboardingTraitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await saveOnboardingTraits({ userId: user.id, traitIds: parsed.data.traitIds }, supabase);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TraitSystemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
