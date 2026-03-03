#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

const read = (relPath) => {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return fs.readFileSync(abs, 'utf8');
};

const contractChecks = [
  {
    file: 'apps/doWhat-web/src/app/api/discovery/activities/route.ts',
    description: 'Route sanitizes invalid rows and aligns facets',
    test: (source) => /alignFacetsWithItems/.test(source) && /if \(!item\.name\.trim\(\)\) return false;/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/api/discovery/activities/__tests__/route.test.ts',
    description: 'Contract test for invalid place-backed row filtering exists',
    test: (source) => /filters invalid place-backed rows and aligns facets/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/api/nearby/__tests__/payload.test.ts',
    description: 'Contract test for refresh result monotonicity exists',
    test: (source) => /returns at least as many rows on refresh/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/map/__tests__/useStableNearbyData.test.tsx',
    description: 'Keep-previous-data behavior test exists',
    test: (source) => /preserves the previous dataset while a refetch is in flight/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/map/__tests__/searchPipeline.integration.test.ts',
    description: 'Search diversity regression test exists',
    test: (source) => /multi-intent search keeps OR semantics/.test(source),
  },
];

const failures = [];

for (const check of contractChecks) {
  const source = read(check.file);
  if (!check.test(source)) {
    failures.push(`${check.file}: ${check.description}`);
  }
}

if (failures.length > 0) {
  console.error('[verify-discovery-contract] Failed.');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[verify-discovery-contract] Passed. Discovery contract guardrails present.');
