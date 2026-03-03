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

const checks = [
  {
    file: 'apps/doWhat-web/src/app/api/sessions/route.ts',
    description: 'Session create route must persist place_label',
    test: (source) => /place_label\s*:\s*placeLabel/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/api/sessions/route.ts',
    description: 'Session create route must reject empty resolved place labels',
    test: (source) => /Resolved place label cannot be empty/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/lib/sessions/server.ts',
    description: 'Session server must provide fallback place label path',
    test: (source) => /return\s+SESSION_PLACE_LABEL_FALLBACK\s*;/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/api/discovery/activities/route.ts',
    description: 'Discovery route must normalize place labels',
    test: (source) => /normalizePlaceLabel/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/api/discovery/activities/route.ts',
    description: 'Discovery route must align facets with returned items',
    test: (source) => /alignFacetsWithItems/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/map/page.tsx',
    description: 'Map page filter arrays must have default fallbacks',
    test: (source) =>
      /filters\.activityTypes\s*\?\?\s*EMPTY_STRING_LIST/.test(source)
      && /filters\.traits\s*\?\?\s*EMPTY_STRING_LIST/.test(source)
      && /filters\.taxonomyCategories\s*\?\?\s*EMPTY_STRING_LIST/.test(source)
      && /filters\.priceLevels\s*\?\?\s*EMPTY_NUMBER_LIST/.test(source),
  },
  {
    file: 'apps/doWhat-web/src/app/venues/page.tsx',
    description: 'Venues page must expose explicit verification states',
    test: (source) => /Needs votes/.test(source) && /Verified/.test(source) && /Suggested/.test(source),
  },
];

const filesForSmellScan = [
  'apps/doWhat-web/src/app/map/page.tsx',
  'apps/doWhat-web/src/app/venues/page.tsx',
  'apps/doWhat-web/src/app/page.tsx',
  'apps/doWhat-web/src/app/api/discovery/activities/route.ts',
  'apps/doWhat-web/src/app/api/nearby/route.ts',
];

const riskyCallPattern = /\b(searchParams|filters|activity_types|tags|traits)\.(map|forEach)\(/g;

const failures = [];

for (const check of checks) {
  const source = read(check.file);
  if (!check.test(source)) {
    failures.push(`${check.file}: ${check.description}`);
  }
}

for (const relPath of filesForSmellScan) {
  const source = read(relPath);
  const matches = source.match(riskyCallPattern) ?? [];
  if (matches.length > 0) {
    failures.push(`${relPath}: risky iteration call detected (${matches.join(', ')})`);
  }

  if (/Cannot access\s+.+\s+before initialization/.test(source)) {
    failures.push(`${relPath}: contains TDZ runtime error string marker`);
  }
}

if (failures.length > 0) {
  console.error('[verify-required-fields] Failed.');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[verify-required-fields] Passed. Required place/discovery/runtime safeguards detected.');
