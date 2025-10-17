-- Optional profile contact fields required by mobile and web clients
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS whatsapp text;
