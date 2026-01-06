# Roadmap

Lightweight roadmap so future contributors know what matters next. Update this file whenever priorities shift.

## Now (Active)
1. **Map experience hardening**
   - Keep `/map` stable for both activities and events (monitor Supabase schema changes, ensure migrations are applied before deploys).
   - Add richer empty states (per-filter messaging, “expand radius” suggestion).
2. **Events ingestion quality**
   - Validate new sources (Bangkok + Bucharest) and tune dedupe/venue matching heuristics.
   - Build alerting when `event_sources.failure_count` crosses thresholds.
3. **Create flow improvements**
   - Streamline “Create an event” deep links from map & venues (prefill venue/place data, guard against missing coordinates).

## Next (Upcoming)
1. **Places verification loop**
   - Surface verification status more prominently in `/venues`.
   - Hook community votes into Supabase so the cache warms priority tiles.
2. **Mobile/web parity**
   - Port recent map filters and taxonomy chips to the Expo client.
   - Ensure analytics events include `platform` + `surface` consistently.
3. **Reliability signals revival**
   - Revisit `event_participants` + `reliability_index` tables now that sessions/events have merged schemas.

## Later / Ideas
- **Personalized recommendations** – blend taxonomy, attendance history, and trait matches for ranked suggestions.
- **Notifications pipeline** – hook Supabase Edge Functions or external workers to send reminders when events are about to start.
- **Self-serve ingestion** – admin UI for adding/updating `event_sources` without touching SQL.

Cross-reference `changes_log.md` for what already shipped and keep this roadmap synchronized with actual priorities.
