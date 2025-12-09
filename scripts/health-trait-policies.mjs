#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const pickEnv = (...keys) => {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
};

const supabaseUrl = pickEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const anonKey = pickEnv('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
const serviceKey = pickEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.log('[trait-health] Skipping trait policy verification because Supabase credentials are missing.');
  process.exit(0);
}

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), 'verify-trait-policies.mjs');
const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit', env: process.env });

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[trait-health] Failed to spawn trait policy verifier:', error.message);
  process.exit(1);
});
