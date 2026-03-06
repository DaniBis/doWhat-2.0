-- Migration 067: expand activity catalog for city seeding/inference packs

UPDATE public.activity_catalog
SET keywords = ARRAY[
  'chess',
  'chess club',
  'chess cafe',
  'board game',
  'board games',
  'cờ vua',
  'หมากรุก'
]
WHERE slug = 'chess';

UPDATE public.activity_catalog
SET keywords = ARRAY[
  'climbing',
  'rock climbing',
  'climbing gym',
  'bouldering',
  'boulder gym',
  'sala escalada',
  'leo nui',
  'phong tap leo nui',
  'ยิมปีนผา',
  'โบลเดอร์'
]
WHERE slug = 'climbing';

UPDATE public.activity_catalog
SET keywords = ARRAY[
  'yoga',
  'yoga studio',
  'meditation',
  'stretching',
  'thiền',
  'โยคะ'
]
WHERE slug = 'yoga';

UPDATE public.activity_catalog
SET keywords = ARRAY[
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
]
WHERE slug = 'running';

INSERT INTO public.activity_catalog (id, slug, name, description, keywords, fsq_categories)
VALUES
  (
    16,
    'padel',
    'Padel',
    'Padel courts and clubs for singles or doubles sessions.',
    ARRAY['padel','pádel','padel court','padel club','sân padel','สนามพาเดล'],
    ARRAY[]::text[]
  ),
  (
    17,
    'bouldering',
    'Bouldering',
    'Indoor bouldering gyms and climbing walls.',
    ARRAY['bouldering','boulder gym','climbing gym','sala escalada','โบลเดอร์'],
    ARRAY['4bf58dd8d48988d1e1931735']
  )
ON CONFLICT (id) DO UPDATE
SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  keywords = EXCLUDED.keywords,
  fsq_categories = EXCLUDED.fsq_categories;
