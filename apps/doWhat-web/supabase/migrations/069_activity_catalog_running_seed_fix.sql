-- Migration 069: ensure the canonical running activity exists for launch-city matching
-- 067 updated running keywords but did not insert the row if an environment only had the baseline 026 seeds.

INSERT INTO public.activity_catalog AS ac (id, slug, name, description, keywords, fsq_categories)
VALUES (
  10,
  'running',
  'Running',
  'Running clubs, tracks, and park routes.',
  ARRAY[
    'running',
    'run club',
    'jogging',
    'track',
    'stadium',
    'park run',
    'chạy bộ',
    'đường chạy',
    'วิ่ง',
    'ลู่วิ่ง'
  ],
  ARRAY[]::text[]
)
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    keywords = EXCLUDED.keywords,
    fsq_categories = EXCLUDED.fsq_categories;
