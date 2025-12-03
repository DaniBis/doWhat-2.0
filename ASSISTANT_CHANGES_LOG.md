# Assistant Change Log

## 2025-12-03
- Updated `apps/doWhat-mobile/src/app/(tabs)/map/index.tsx` to better understand Supabase-linked venues:
  - Expanded `PlaceMetadata` typing and added helpers (`normaliseStringId`, `extractVenueIdFromMetadata`, `resolveVenueIdForSaving`) so the map can discover canonical venue ids embedded in metadata.
  - Track the active venue’s session counts via `v_venue_attendance_summary`, including new loading state management.
  - Added save/unsave button logic in the place detail sheet (leveraging `SavedActivitiesContext`) with optimistic UI feedback and error alerts.
  - Surfaced upcoming/total session messaging inside the detail card and introduced associated styles.
- Introduced an admin-only dashboard at `apps/doWhat-web/src/app/admin/page.tsx`:
  - Gate access via `NEXT_PUBLIC_ADMIN_EMAILS` and reuse the Supabase browser client for auth & data fetching.
  - Surface analytics cards (user/session/venue counts + top categories) plus refresh controls.
  - Render full session & venue listings with inline delete actions so inappropriate content can be removed quickly.
