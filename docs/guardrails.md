# doWhat Guardrails

## Primary verify command

Run the full fail-fast matrix with:

```bash
pnpm verify:dowhat
```

This runs, in order:

1. `node scripts/verify-no-hardcoded-discovery.mjs`
2. `node scripts/verify-required-fields.mjs`
3. `node scripts/verify-discovery-contract.mjs`
4. `pnpm -w lint`
5. `pnpm -w typecheck`
6. `pnpm --filter dowhat-web test -- --runInBand`
7. `pnpm --filter dowhat-web exec playwright test tests/e2e/health.spec.ts`
8. `pnpm --filter doWhat-mobile test -- --maxWorkers=50%`
9. `pnpm --filter doWhat-mobile exec npx expo-doctor`
10. `pnpm test:onboarding-progress`
11. `pnpm --filter @dowhat/shared test`
12. `node scripts/verify-trait-policies.mjs`
13. `pnpm -w run health`

The command stops on the first failure.

## Safety scripts

- `scripts/verify-no-hardcoded-discovery.mjs`
- `scripts/verify-required-fields.mjs`
- `scripts/verify-discovery-contract.mjs`

You can run these individually with:

```bash
pnpm verify:no-hardcoded-discovery
pnpm verify:required-fields
pnpm verify:discovery-contract
```

## Data verifier (existing)

The previous Supabase dataset verifier is still available:

```bash
pnpm verify:dowhat:data
```
