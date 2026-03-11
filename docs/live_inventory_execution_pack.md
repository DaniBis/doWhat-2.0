# Live Inventory Execution Pack

This runbook is the exact operator flow for the live target-city inventory sweep.

Target cities:

- Hanoi
- Da Nang
- Bangkok

Use this from a machine that has:

- working DB connectivity for `DATABASE_URL` / `SUPABASE_DB_URL`
- access to the deployed web app cron routes via `CRON_BASE_URL`
- a valid `CRON_SECRET`

This pack does **not** change discovery semantics. It packages the already-approved cleanup and audit flow so a human can run it safely and record launch status.

## Output Directory Convention

Use one timestamped artifact directory per run:

```bash
export INVENTORY_RUN_ID="$(date +%Y-%m-%d_%H-%M-%S)"
export INVENTORY_ARTIFACT_DIR="artifacts/inventory-live/${INVENTORY_RUN_ID}"
mkdir -p "$INVENTORY_ARTIFACT_DIR"
```

Expected files per city:

- `<city>-rematch-dry-run.json`
- `<city>-rematch-apply.json`
- `<city>-audit.json`
- `<city>-status.md`

Optional:

- `<city>-manual-review.md`

## Exact Command Order Per City

Replace `<city>` with `hanoi`, `danang`, or `bangkok`.

### 1. Seed Health Check

```bash
pnpm verify:seed-health --city=<city> --packVersion=2026-03-04.v1
```

Pass:
- seed tiles exist
- required packs are present
- provider counts are non-zero

Fail:
- stop and fix seed freshness before rematch/audit

### 2. Rematch Dry Run

```bash
pnpm inventory:rematch --city=<city> --output="$INVENTORY_ARTIFACT_DIR/<city>-rematch-dry-run.json"
```

Capture and inspect:
- `runStatus`
- `deletes`
- `hospitalityKeywordDeletes`
- `eventEvidenceProtectedMatches`
- `errorCount`

Interpretation:
- `hospitalityKeywordDeletes > 0` means stale hospitality keyword mappings are ready to be removed
- `errorCount > 0` means do not trust the run yet; investigate before applying

### 3. Rematch Apply

Only run apply if the dry run completed cleanly enough to proceed.

```bash
pnpm inventory:rematch --city=<city> --apply --output="$INVENTORY_ARTIFACT_DIR/<city>-rematch-apply.json"
```

Pass:
- `runStatus = ok`
- `errorCount = 0`

Fail / block:
- `runStatus = partial`
- non-zero `errorCount`

### 4. Strict City Audit

```bash
pnpm inventory:audit:city --city=<city> --strict --format=json --output="$INVENTORY_ARTIFACT_DIR/<city>-audit.json"
```

Pass:
- command exits `0`
- `overallStatus = acceptable`

Suspicious:
- command exits non-zero because `overallStatus = suspicious`
- manual review required before launch

Fail / block:
- command exits non-zero because `overallStatus = failing`
- city is not launch-ready

### 5. Generate Final City Status Summary

```bash
pnpm inventory:status --dir="$INVENTORY_ARTIFACT_DIR" --city=<city> --format=markdown --output="$INVENTORY_ARTIFACT_DIR/<city>-status.md"
```

This report summarizes:

- city
- rematch run status
- audit status
- coverage status
- hospitality leakage status
- duplicate/stale mapping status
- manual review required yes/no
- launch recommendation

### 6. Manual Review Sweep

Use both:

- [launch_city_inventory_checklist.md](/Users/danielbisceanu/doWhat/docs/launch_city_inventory_checklist.md)
- `$INVENTORY_ARTIFACT_DIR/<city>-status.md`

Review at minimum:

- `hospitalityLeakage` samples
- `providerDisagreements` samples
- `sessionMappingGaps` samples
- `duplicateClusters` samples
- missing required activity coverage

Suggested operator note file:

```bash
cat > "$INVENTORY_ARTIFACT_DIR/<city>-manual-review.md" <<'EOF'
# <CITY> Manual Review

- hospitality leakage reviewed:
- provider disagreements reviewed:
- session mapping gaps reviewed:
- duplicate clusters reviewed:
- missing required activity coverage reviewed:
- final operator decision:
EOF
```

## All-Cities Sequence

Run these in order:

```bash
for city in hanoi danang bangkok; do
  pnpm verify:seed-health --city="$city" --packVersion=2026-03-04.v1
  pnpm inventory:rematch --city="$city" --output="$INVENTORY_ARTIFACT_DIR/${city}-rematch-dry-run.json"
done
```

After reviewing the dry-run artifacts:

```bash
for city in hanoi danang bangkok; do
  pnpm inventory:rematch --city="$city" --apply --output="$INVENTORY_ARTIFACT_DIR/${city}-rematch-apply.json"
  pnpm inventory:audit:city --city="$city" --strict --format=json --output="$INVENTORY_ARTIFACT_DIR/${city}-audit.json"
  pnpm inventory:status --dir="$INVENTORY_ARTIFACT_DIR" --city="$city" --format=markdown --output="$INVENTORY_ARTIFACT_DIR/${city}-status.md"
done
```

Final combined summary:

```bash
pnpm inventory:status --dir="$INVENTORY_ARTIFACT_DIR" --all --format=markdown --output="$INVENTORY_ARTIFACT_DIR/live-inventory-status.md"
```

## Launch Recommendation Rules

`launch-acceptable`
- rematch apply completed cleanly
- audit is `acceptable`
- no remaining manual-review blockers

`manual-review-required`
- no hard failure, but suspicious samples or unresolved review items remain

`blocked`
- rematch apply missing or errored
- audit missing
- audit `failing`
- required coverage missing
- hospitality leakage or duplicate/stale mapping status is `failing`

## What Must Be Captured

For every city, save:

- rematch dry-run JSON
- rematch apply JSON
- audit JSON
- status markdown
- manual review notes

Do not rely on terminal scrollback alone.

## Known Blind Spots

- This pack cannot prove real-world market completeness.
- Imported external events are not used as canonical activity-mapping evidence in the current audit.
- If DB or cron access is broken, this pack will fail operationally even if the local repo is healthy.

## If Something Fails

### Seed health fails

- stop and fix seed freshness before auditing

### Dry-run rematch fails

- stop
- inspect cron auth / environment / matcher health

### Apply rematch fails

- city is blocked
- do not continue to launch sign-off

### Audit fails

- inspect the generated JSON
- follow the manual review checklist
- rerun rematch/audit only after the underlying issue is corrected
