import { createClient } from "@supabase/supabase-js";

// Lightweight shared client; suited for simple browser contexts.
// Next.js SSR and Expo have their own clients in their app folders.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon);
