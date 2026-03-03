#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'No hardcoded discovery', cmd: ['node', 'scripts/verify-no-hardcoded-discovery.mjs'] },
  { name: 'Required field/runtime safeguards', cmd: ['node', 'scripts/verify-required-fields.mjs'] },
  { name: 'Discovery contract script', cmd: ['node', 'scripts/verify-discovery-contract.mjs'] },
  { name: 'Lint', cmd: ['pnpm', '-w', 'lint'] },
  { name: 'Typecheck', cmd: ['pnpm', '-w', 'typecheck'] },
  { name: 'Web Jest (runInBand)', cmd: ['pnpm', '--filter', 'dowhat-web', 'test', '--', '--runInBand'] },
  { name: 'Web Playwright smoke', cmd: ['pnpm', '--filter', 'dowhat-web', 'exec', 'playwright', 'test', 'tests/e2e/health.spec.ts'] },
  { name: 'Mobile Jest', cmd: ['pnpm', '--filter', 'doWhat-mobile', 'test', '--', '--maxWorkers=50%'] },
  { name: 'Expo doctor', cmd: ['pnpm', '--filter', 'doWhat-mobile', 'exec', 'npx', 'expo-doctor'] },
  { name: 'Onboarding progress checks', cmd: ['pnpm', 'test:onboarding-progress'] },
  { name: 'Shared package tests', cmd: ['pnpm', '--filter', '@dowhat/shared', 'test'] },
  { name: 'Trait policy verifier', cmd: ['node', 'scripts/verify-trait-policies.mjs'] },
  { name: 'Workspace health', cmd: ['pnpm', '-w', 'run', 'health'] },
];

for (const step of steps) {
  console.log(`\n[verify:dowhat] ▶ ${step.name}`);
  const result = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[verify:dowhat] ✗ ${step.name} failed to start:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[verify:dowhat] ✗ ${step.name} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }

  console.log(`[verify:dowhat] ✓ ${step.name}`);
}

console.log('\n[verify:dowhat] All guardrail checks passed.');
