#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const INCLUDE_DIRS = [
  'apps/doWhat-web/src',
  'packages/shared/src',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

const EXCLUDE_PATH_SEGMENTS = [
  '__tests__',
  '/tests/',
  '/test/',
  '/fixtures/',
  '/mocks/',
  '/mock/',
  '/dist/',
  '/node_modules/',
];

const RULE_EXCLUDED_FILES = {
  hardcoded_discovery_array: new Set([
    'packages/shared/src/activityIntelligence/taxonomy.ts',
  ]),
};

const RULES = [
  {
    id: 'placeholder_discovery_phrase',
    description: 'Hardcoded discovered-nearby placeholder copy',
    regex: /discovered\s+nearby/gi,
  },
  {
    id: 'fake_event_phrases',
    description: 'Fake event placeholder labels in production source',
    regex: /\b(chess\s+today|demo\s+event|test\s+event|sample\s+event|placeholder\s+event|fake\s+event|dummy\s+event)\b/gi,
  },
  {
    id: 'hardcoded_discovery_array',
    description: 'Likely hardcoded discovery inventory array literal',
    regex: /const\s+[A-Za-z0-9_]*(discover|nearby|activity|event)[A-Za-z0-9_]*\s*=\s*\[\s*\{/gi,
  },
  {
    id: 'hardcoded_seeded_inventory',
    description: 'Likely hardcoded venue inventory payload',
    regex: /\b(seed(ed)?\s+(venue|place|inventory)|mock\s+(venue|place)\s+list)\b/gi,
  },
];

const normalizePath = (value) => value.split(path.sep).join('/');

const shouldScanFile = (absPath) => {
  const normalized = normalizePath(absPath);
  if (!SOURCE_EXTENSIONS.has(path.extname(absPath))) return false;
  return !EXCLUDE_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
};

const walkFiles = (absDir) => {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absPath));
      continue;
    }
    if (entry.isFile() && shouldScanFile(absPath)) {
      files.push(absPath);
    }
  }
  return files;
};

const findLineNumber = (source, index) => source.slice(0, index).split('\n').length;

const failures = [];

for (const relDir of INCLUDE_DIRS) {
  const absDir = path.join(ROOT, relDir);
  if (!fs.existsSync(absDir)) continue;

  const files = walkFiles(absDir);
  for (const absFile of files) {
    const relativeFile = normalizePath(path.relative(ROOT, absFile));
    const source = fs.readFileSync(absFile, 'utf8');
    for (const rule of RULES) {
      if (RULE_EXCLUDED_FILES[rule.id]?.has(relativeFile)) {
        continue;
      }
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(source)) !== null) {
        const line = findLineNumber(source, match.index);
        failures.push({
          file: relativeFile,
          line,
          rule: rule.id,
          description: rule.description,
          snippet: match[0],
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error('[verify-no-hardcoded-discovery] Failed. Potential hardcoded discovery artifacts found:');
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} [${failure.rule}] ${failure.description} -> ${failure.snippet}`);
  }
  process.exit(1);
}

console.log('[verify-no-hardcoded-discovery] Passed. No hardcoded discovery placeholders detected.');
