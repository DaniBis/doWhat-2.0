#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const STATUS_ORDER = {
  acceptable: 0,
  suspicious: 1,
  failing: 2,
  missing: 3,
};

const TARGET_CITIES = ['hanoi', 'danang', 'bangkok'];

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

const combineStatus = (...statuses) =>
  statuses.reduce((current, next) => (STATUS_ORDER[next] > STATUS_ORDER[current] ? next : current), 'acceptable');

const normalizeCity = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

export const parseArgs = (argv) => {
  const result = {
    dir: '',
    cities: [],
    all: false,
    format: 'table',
    output: '',
    strict: false,
    help: false,
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, rawValue] = arg.slice(2).split('=');
    const value = (rawValue ?? '').trim();
    if (key === 'dir') result.dir = value;
    if (key === 'city' && value) result.cities.push(normalizeCity(value));
    if (key === 'cities' && value) {
      result.cities.push(...value.split(',').map((entry) => normalizeCity(entry)).filter(Boolean));
    }
    if (key === 'all') result.all = value !== '0' && value !== 'false';
    if (key === 'format' && value) result.format = value;
    if (key === 'json') result.format = 'json';
    if (key === 'markdown') result.format = 'markdown';
    if (key === 'output' && value) result.output = value;
    if (key === 'strict') result.strict = value !== '0' && value !== 'false';
    if (key === 'help' || key === 'h') result.help = true;
  });

  result.cities = result.all || result.cities.includes('all')
    ? [...TARGET_CITIES]
    : uniq(result.cities.filter((value) => TARGET_CITIES.includes(value)));

  return result;
};

const printUsage = () => {
  console.log(`Usage:
  node scripts/city-inventory-status-report.mjs --dir=artifacts/inventory-live-run --all
  node scripts/city-inventory-status-report.mjs --dir=artifacts/inventory-live-run --city=hanoi --format=markdown

Expected files inside --dir:
  hanoi-rematch-dry-run.json
  hanoi-rematch-apply.json
  hanoi-audit.json
  danang-rematch-dry-run.json
  danang-rematch-apply.json
  danang-audit.json
  bangkok-rematch-dry-run.json
  bangkok-rematch-apply.json
  bangkok-audit.json

Notes:
  - The report is for operator summary only; it does not rerun the audit itself.
  - Use --strict to return non-zero when any city is not launch-acceptable.`);
};

const readJsonIfPresent = async (path) => {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const getAuditBucketStatus = (audit, key) => audit?.audits?.[key]?.status ?? 'missing';

const deriveCoverageStatus = (audit) =>
  audit && audit.coverage && Object.keys(audit.coverage).length > 0
    ? Object.values(audit.coverage).reduce(
      (status, entry) => combineStatus(status, entry?.status ?? 'missing'),
      'acceptable',
    )
    : 'missing';

const deriveDuplicateStaleStatus = (audit) =>
  audit
    ? combineStatus(
      getAuditBucketStatus(audit, 'duplicateClusters'),
      getAuditBucketStatus(audit, 'staleMappings'),
      getAuditBucketStatus(audit, 'weakMappings'),
      getAuditBucketStatus(audit, 'sessionMappingGaps'),
    )
    : 'missing';

const deriveManualReviewRequired = (summary) =>
  summary.auditStatus !== 'acceptable'
  || summary.hospitalityLeakageStatus !== 'acceptable'
  || summary.duplicateStaleStatus !== 'acceptable'
  || summary.providerDisagreementCount > 0
  || summary.sessionMappingGapCount > 0;

const deriveLaunchRecommendation = (summary) => {
  if (
    summary.auditStatus === 'missing'
    || summary.rematchRunStatus === 'missing'
    || summary.coverageStatus === 'missing'
    || summary.hospitalityLeakageStatus === 'missing'
    || summary.duplicateStaleStatus === 'missing'
  ) return 'blocked';
  if (summary.rematchRunStatus === 'error') return 'blocked';
  if (summary.auditStatus === 'failing' || summary.coverageStatus === 'failing' || summary.hospitalityLeakageStatus === 'failing' || summary.duplicateStaleStatus === 'failing') {
    return 'blocked';
  }
  if (summary.manualReviewRequired) return 'manual-review-required';
  return 'launch-acceptable';
};

const deriveRematchRunStatus = ({ dryRun, apply }) => {
  if (!dryRun && !apply) return 'missing';
  if (apply) {
    if (apply.runStatus === 'partial' || (apply.errorCount ?? 0) > 0) return 'error';
    return 'applied';
  }
  if (dryRun.runStatus === 'partial' || (dryRun.errorCount ?? 0) > 0) return 'error';
  return 'dry-run-only';
};

const buildManualReviewCandidates = (audit) => {
  if (!audit) return [];
  const groups = [
    ['hospitalityLeakage', 'Hospitality leakage'],
    ['providerDisagreements', 'Hospitality exceptions to verify'],
    ['sessionMappingGaps', 'Session-to-mapping gaps'],
    ['duplicateClusters', 'Duplicate clusters'],
    ['staleMappings', 'Stale mappings'],
  ];

  return groups
    .map(([key, label]) => {
      const bucket = audit.audits?.[key];
      if (!bucket || !Array.isArray(bucket.samples) || bucket.samples.length === 0) return null;
      return {
        key,
        label,
        count: bucket.count ?? bucket.samples.length,
        samples: bucket.samples,
      };
    })
    .filter(Boolean);
};

export const buildCityStatusSummary = ({ city, dryRun, apply, audit }) => {
  const auditStatus = audit?.overallStatus ?? 'missing';
  const coverageStatus = deriveCoverageStatus(audit);
  const hospitalityLeakageStatus = audit?.audits?.hospitalityLeakage?.status ?? 'missing';
  const duplicateStaleStatus = deriveDuplicateStaleStatus(audit);
  const rematchRunStatus = deriveRematchRunStatus({ dryRun, apply });
  const providerDisagreementCount = audit?.audits?.providerDisagreements?.count ?? 0;
  const sessionMappingGapCount = audit?.audits?.sessionMappingGaps?.count ?? 0;

  const summary = {
    city,
    label: audit?.label ?? city,
    rematchRunStatus,
    auditStatus,
    coverageStatus,
    hospitalityLeakageStatus,
    duplicateStaleStatus,
    manualReviewRequired: false,
    providerDisagreementCount,
    sessionMappingGapCount,
    manualReviewCandidates: buildManualReviewCandidates(audit),
    rematch: {
      dryRun: dryRun
        ? {
          runStatus: dryRun.runStatus ?? 'unknown',
          hospitalityKeywordDeletes: dryRun.hospitalityKeywordDeletes ?? 0,
          deletes: dryRun.deletes ?? 0,
          eventEvidenceProtectedMatches: dryRun.eventEvidenceProtectedMatches ?? 0,
          errorCount: dryRun.errorCount ?? 0,
        }
        : null,
      apply: apply
        ? {
          runStatus: apply.runStatus ?? 'unknown',
          hospitalityKeywordDeletes: apply.hospitalityKeywordDeletes ?? 0,
          deletes: apply.deletes ?? 0,
          eventEvidenceProtectedMatches: apply.eventEvidenceProtectedMatches ?? 0,
          errorCount: apply.errorCount ?? 0,
        }
        : null,
    },
    audit,
    launchRecommendation: 'blocked',
  };

  summary.manualReviewRequired = deriveManualReviewRequired(summary);
  summary.launchRecommendation = deriveLaunchRecommendation(summary);
  return summary;
};

export const formatStatusReport = (summaries, format = 'table') => {
  if (format === 'json') {
    return JSON.stringify(summaries, null, 2);
  }

  if (format === 'markdown') {
    const lines = ['# Live Inventory Status Report', ''];
    summaries.forEach((summary) => {
      lines.push(`## ${summary.label}`);
      lines.push(`- rematch run status: \`${summary.rematchRunStatus}\``);
      lines.push(`- audit status: \`${summary.auditStatus}\``);
      lines.push(`- coverage status: \`${summary.coverageStatus}\``);
      lines.push(`- hospitality leakage status: \`${summary.hospitalityLeakageStatus}\``);
      lines.push(`- duplicate/stale mapping status: \`${summary.duplicateStaleStatus}\``);
      lines.push(`- manual review required: \`${summary.manualReviewRequired ? 'yes' : 'no'}\``);
      lines.push(`- launch recommendation: \`${summary.launchRecommendation}\``);
      if (summary.manualReviewCandidates.length) {
        lines.push('- manual review candidates:');
        summary.manualReviewCandidates.forEach((candidate) => {
          lines.push(`  - ${candidate.label}: ${candidate.count}`);
        });
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  const lines = [];
  summaries.forEach((summary) => {
    lines.push(`[inventory-status] ${summary.label}`);
    lines.push(`  rematchRunStatus=${summary.rematchRunStatus}`);
    lines.push(`  auditStatus=${summary.auditStatus}`);
    lines.push(`  coverageStatus=${summary.coverageStatus}`);
    lines.push(`  hospitalityLeakageStatus=${summary.hospitalityLeakageStatus}`);
    lines.push(`  duplicateStaleMappingStatus=${summary.duplicateStaleStatus}`);
    lines.push(`  manualReviewRequired=${summary.manualReviewRequired ? 'yes' : 'no'}`);
    lines.push(`  launchRecommendation=${summary.launchRecommendation}`);
    if (summary.manualReviewCandidates.length) {
      lines.push('  manualReviewCandidates=');
      summary.manualReviewCandidates.forEach((candidate) => {
        lines.push(`    - ${candidate.label}: ${candidate.count}`);
      });
    }
  });
  return lines.join('\n');
};

const loadCityArtifacts = async (dir, city) => {
  const dryRun = await readJsonIfPresent(`${dir}/${city}-rematch-dry-run.json`);
  const apply = await readJsonIfPresent(`${dir}/${city}-rematch-apply.json`);
  const auditRaw = await readJsonIfPresent(`${dir}/${city}-audit.json`);
  const audit = Array.isArray(auditRaw) ? auditRaw[0] ?? null : auditRaw;
  return { dryRun, apply, audit };
};

export const runStatusReport = async (args) => {
  if (!args.dir) {
    throw new Error('Provide --dir=<artifact-directory>.');
  }
  if (!args.cities.length) {
    throw new Error('Provide --city=<slug> or --all.');
  }

  const summaries = [];
  for (const city of args.cities) {
    const artifacts = await loadCityArtifacts(args.dir, city);
    summaries.push(buildCityStatusSummary({ city, ...artifacts }));
  }
  return summaries;
};

export const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const summaries = await runStatusReport(args);
  const output = formatStatusReport(summaries, args.format);
  console.log(output);
  if (args.output) {
    await writeFile(args.output, output, 'utf8');
  }
  if (args.strict && summaries.some((summary) => summary.launchRecommendation !== 'launch-acceptable')) {
    process.exitCode = 1;
  }
};

const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectExecution) {
  main().catch((error) => {
    console.error('[city-inventory-status-report] failed', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
