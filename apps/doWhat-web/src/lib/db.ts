import { createClient } from '@/lib/supabase/server';

export function db() {
  return createClient();
}

export type ActivityRow = {
  id: string
  name: string
  description?: string | null
  venue?: string | null
  activity_types?: string[] | null
  tags?: string[] | null
  phone_text?: string | null
  opening_hours?: any
  photos?: any
  external_urls?: string[] | null
  rating?: number | null
  rating_count?: number | null
  price_cents?: number | null
  lat?: number | null
  lng?: number | null
  geom?: unknown
  created_at?: string
  updated_at?: string
};

