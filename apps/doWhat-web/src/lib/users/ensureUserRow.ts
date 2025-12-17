import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";

type EnsurePayload = {
  id: string;
  email: string;
  fullName: string | null;
};

type PossibleError = PostgrestError | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null; constraint?: string | null };

const isRowLevelSecurityError = (error: PossibleError): boolean => {
  const code = typeof error.code === "string" ? error.code : null;
  if (code && code !== "42501") return false;
  const message = typeof error.message === "string" ? error.message : "";
  const details = typeof error.details === "string" ? error.details : "";
  return code === "42501" || /row[- ]level security/i.test(message) || /row[- ]level security/i.test(details);
};

const isUsersEmailConflict = (error: PossibleError): boolean => {
  const code = typeof error.code === "string" ? error.code : null;
  if (code !== "23505") return false;
  const constraint =
    "constraint" in error && typeof (error as { constraint?: string | null }).constraint === "string"
      ? (error as { constraint?: string | null }).constraint
      : null;
  const markers = [error.message, error.details, error.hint, constraint].map((value) =>
    typeof value === "string" ? value : ""
  );
  return markers.some((text) => /users?_email_key/i.test(text));
};

const ensureViaRpc = async (
  supabase: SupabaseClient,
  { id, email, fullName }: EnsurePayload
): Promise<boolean> => {
  const { error } = await supabase.rpc("ensure_public_user_row", {
    p_user: id,
    p_email: email,
    p_full_name: fullName,
  });
  if (error) {
    console.warn("[ensureUserRow] ensure_public_user_row RPC failed", error);
    return false;
  }
  return true;
};

const extractFullName = (metadata: User["user_metadata"]): string | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [metadata.full_name, metadata.fullName, metadata.name];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

export async function ensureUserRow(supabase: SupabaseClient, user: User): Promise<boolean> {
  const email = typeof user.email === "string" && user.email.trim() ? user.email.trim() : null;
  if (!email) {
    console.warn("[ensureUserRow] missing email, cannot upsert user row");
    return false;
  }
  const payload: EnsurePayload = { id: user.id, email, fullName: extractFullName(user.user_metadata) };
  const { error } = await supabase.from("users").upsert(
    { id: payload.id, email: payload.email, full_name: payload.fullName },
    { onConflict: "id" }
  );
  if (!error) {
    return true;
  }
  if (isRowLevelSecurityError(error) || isUsersEmailConflict(error)) {
    return ensureViaRpc(supabase, payload);
  }
  console.warn("[ensureUserRow] users upsert failed", error);
  return false;
}
