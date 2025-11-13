#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keySpecs = [
  { name: 'DATABASE_URL' },
  { name: 'SUPABASE_URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', optional: true },
  { name: 'EXPO_PUBLIC_SUPABASE_URL', optional: true },
  { name: 'SUPABASE_ANON_KEY' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', optional: true },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', optional: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY' },
  { name: 'SUPABASE_SERVICE_KEY', optional: true },
  { name: 'FSQ_API_KEY' },
  { name: 'FOURSQUARE_API_KEY', optional: true },
  { name: 'OVERPASS_URL', optional: true },
  { name: 'OVERPASS_API_URL' },
  { name: 'GOOGLE_PLACES_API_KEY', optional: true },
  { name: 'CRON_SECRET' },
  { name: 'POSTHOG_KEY', optional: true },
  { name: 'SENTRY_DSN', optional: true },
];

const envFiles = [
  { label: 'root .env.local', path: '.env.local' },
  { label: 'web .env.local', path: 'apps/doWhat-web/.env.local' },
  { label: 'mobile .env.local', path: 'apps/doWhat-mobile/.env.local' },
];

const parseEnvFile = (filePath) => {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    return { path: absolute, values: new Map() };
  }
  const content = readFileSync(absolute, 'utf8');
  const values = new Map();
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z0-9_\.\-]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] ?? '';
    value = value.replace(/^['\"]|['\"]$/g, '');
    values.set(key, value);
  });
  return { path: absolute, values };
};

const fileData = envFiles.map(({ label, path }) => {
  const parsed = parseEnvFile(path);
  return { label, ...parsed };
});

const rows = keySpecs.map((spec) => {
  const sources = [];
  fileData.forEach(({ label, values }) => {
    if (values.has(spec.name)) {
      sources.push(label);
    }
  });
  if (process.env[spec.name]) {
    sources.push('process.env');
  }
  return { ...spec, sources };
});

const pad = (str, len) => str.padEnd(len, ' ');

const header = `${pad('Key', 28)} Source(s)`;
const divider = '-'.repeat(header.length);

console.log('Env health check');
console.log(header);
console.log(divider);
rows.forEach(({ name, optional, sources }) => {
  const status = sources.length ? sources.join(', ') : 'missing';
  const optionalMark = optional ? ' (optional)' : '';
  console.log(`${pad(name, 28)} ${status}${optionalMark}`);
});

const missingRequired = rows.filter(({ optional, sources }) => !optional && sources.length === 0);
if (missingRequired.length) {
  console.log('\nMissing required keys:');
  missingRequired.forEach(({ name }) => console.log(` - ${name}`));
  process.exitCode = 1;
}
