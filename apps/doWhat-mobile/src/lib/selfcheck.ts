import { supabase } from "./supabase";
export async function supabasePing() {
  const { error } = await supabase.from("profiles").select("id").limit(1);
  return { ok: !error, error: error?.message };
}