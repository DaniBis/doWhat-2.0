import loadEnv from "../scripts/utils/load-env.mjs";
import { createClient } from "@supabase/supabase-js";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase.from("profiles").select("id").limit(1);
console.log({ error, data });
