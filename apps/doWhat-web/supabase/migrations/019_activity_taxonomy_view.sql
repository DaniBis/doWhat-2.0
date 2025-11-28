-- 019_activity_taxonomy_view.sql
-- Adds additional metadata columns to v_activity_taxonomy_flat for downstream clients

drop view if exists public.v_activity_taxonomy_flat;

create or replace view public.v_activity_taxonomy_flat as
select
  tier3.id as tier3_id,
  tier3.label as tier3_label,
  tier3.description as tier3_description,
  tier3.tags as tier3_tags,
  tier3.icon_key as tier3_icon_key,
  tier3.weight as tier3_weight,
  tier2.id as tier2_id,
  tier2.label as tier2_label,
  tier2.description as tier2_description,
  tier2.tags as tier2_tags,
  tier2.icon_key as tier2_icon_key,
  tier2.weight as tier2_weight,
  tier1.id as tier1_id,
  tier1.label as tier1_label,
  tier1.description as tier1_description,
  tier1.tags as tier1_tags,
  tier1.icon_key as tier1_icon_key,
  tier1.color_token as tier1_color_token,
  tier1.weight as tier1_weight
from public.activity_categories tier3
left join public.activity_categories tier2 on tier3.parent_id = tier2.id
left join public.activity_categories tier1 on tier2.parent_id = tier1.id
where tier3.tier = 3;
