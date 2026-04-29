#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import loadEnv from './utils/load-env.mjs';

loadEnv(['.env.local', 'apps/doWhat-web/.env.local']);

const BASE_URL = process.env.HANOI_MAP_BASE_URL ?? 'http://127.0.0.1:3002';
const RUN_COUNT = Number.parseInt(process.env.VERIFY_RUN_COUNT ?? '10', 10);
const SCENARIO = {
	center: { lat: 21.0285, lng: 105.8542 },
	query: 'climb',
	route: '/map?e2e=1&debug=1',
};
const EXPECTED_VENUES = [
	{ name: 'VietClimb', placeId: '3d9e27a6-c62f-4906-a2cf-5d7b406e82fd' },
	{ name: 'Beefy Boulders Tay Ho', placeId: 'baba5de0-6030-4f57-a6b1-a30643a9d724' },
	{ name: 'Beefy Boulders My Dinh', placeId: '45b2cc2b-3e2d-4ab4-baec-e338306af813' },
];
const EXPECTED_NAME_SET = new Set(EXPECTED_VENUES.map((venue) => venue.name));
const OUTPUT_ROOT = path.resolve(process.cwd(), 'artifacts', 'hanoi-strict-climb-live');
const SEARCH_TIMEOUT_MS = 45_000;
const AFTER_SEARCH_SETTLE_MS = 1_500;

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const trimText = (value) => value.replace(/\s+/g, ' ').trim();
const arraysEqual = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

const urlQueryText = (value) => {
	try {
		return (new URL(value).searchParams.get('q') ?? '').trim();
	} catch {
		return '';
	}
};

const parseRequestMetaFromUrl = (value) => {
	try {
		const parsed = new URL(value);
		return {
			url: value,
			centerLat: Number(parsed.searchParams.get('lat')),
			centerLng: Number(parsed.searchParams.get('lng')),
			radiusMeters: Number(parsed.searchParams.get('radius')),
		};
	} catch {
		return {
			url: value,
			centerLat: null,
			centerLng: null,
			radiusMeters: null,
		};
	}
};

const formatRowList = (rows) => rows.map((row) => `${row.id ?? 'null'}:${row.name ?? 'null'}`).join('<br>');
const formatNameList = (names) => names.join('<br>');

const pickEnv = (...keys) => {
	for (const key of keys) {
		const value = process.env[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
};

const ensureDir = async (dirPath) => {
	await fs.mkdir(dirPath, { recursive: true });
};

const haversineMeters = (left, right) => {
	const toRadians = (value) => (value * Math.PI) / 180;
	const earthRadius = 6_371_000;
	const latDelta = toRadians(right.lat - left.lat);
	const lngDelta = toRadians(right.lng - left.lng);
	const a =
		Math.sin(latDelta / 2) ** 2
		+ Math.cos(toRadians(left.lat)) * Math.cos(toRadians(right.lat)) * Math.sin(lngDelta / 2) ** 2;
	return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const createSupabaseClient = () => {
	const url = pickEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
	const key = pickEnv('SUPABASE_SERVICE_ROLE_KEY');
	if (!url || !key) return null;
	return createClient(url, key, { auth: { persistSession: false } });
};

const collectVenueDbState = async () => {
	const supabase = createSupabaseClient();
	if (!supabase) return new Map();

	const placeIds = EXPECTED_VENUES.map((venue) => venue.placeId);
	const [placeResult, activityResult] = await Promise.all([
		supabase
			.from('places')
			.select('id,name,lat,lng')
			.in('id', placeIds),
		supabase
			.from('venue_activities')
			.select('venue_id,activity_id,source,confidence')
			.in('venue_id', placeIds),
	]);

	if (placeResult.error) throw placeResult.error;
	if (activityResult.error) throw activityResult.error;

	const rowsByPlaceId = new Map();
	for (const venue of EXPECTED_VENUES) {
		const place = (placeResult.data ?? []).find((row) => row.id === venue.placeId) ?? null;
		const mappedActivities = (activityResult.data ?? []).filter((row) => row.venue_id === venue.placeId);
		rowsByPlaceId.set(venue.placeId, { place, mappedActivities });
	}

	return rowsByPlaceId;
};

const resetTruthPass = async (page) => {
	await page.evaluate(() => {
		window.__HANOI_TRUTH_PASS__ = {
			nearbyRequests: [],
			uiState: null,
			updatedAt: new Date().toISOString(),
		};
	});
};

const waitForInitialActivitiesList = async (page) => {
	await page.locator('section[aria-label="Activities list"]').waitFor({ state: 'visible', timeout: SEARCH_TIMEOUT_MS });
};

const applyStrictSearch = async (page, query) => {
	await page.getByRole('button', { name: /^Filters/i }).first().click();
	const drawer = page.locator('div.fixed.inset-0.z-40').first();
	await drawer.waitFor({ state: 'visible', timeout: 10_000 });
	const input = page.locator('#map-filter-search');
	await input.fill('');
	await input.fill(query);
	const uiRadiusLabel = trimText(await page.locator('text=/Current area: radius ~/').first().innerText());
	await drawer.getByRole('button', { name: 'Close' }).click({ force: true });
	return { uiRadiusLabel };
};

const waitForStrictTruthPass = async (page, query) => {
	await page.waitForFunction(
		(expectedQuery) => {
			const state = window.__HANOI_TRUTH_PASS__;
			if (!state?.uiState) return false;
			const strictRequest = [...(state.nearbyRequests ?? [])]
				.reverse()
				.find((entry) => entry.mode === 'strict' && entry.queryText === expectedQuery && entry.finishedAt);
			return Boolean(strictRequest && state.uiState.queryText === expectedQuery && state.uiState.activeMode === 'strict');
		},
		query,
		{ timeout: SEARCH_TIMEOUT_MS },
	);
	await page.waitForTimeout(AFTER_SEARCH_SETTLE_MS);
};

const collectDomRows = async (page) =>
	page.locator('section[aria-label="Activities list"] li').evaluateAll((items) =>
		items.map((item) => {
			const name = item.querySelector('.text-base.font-semibold.text-ink')?.textContent ?? '';
			const subtitle = item.querySelector('.mt-xxs.flex.items-center.gap-xxs.text-xs.text-ink-muted span:last-child')?.textContent ?? '';
			return {
				name: name.replace(/\s+/g, ' ').trim(),
				subtitle: subtitle.replace(/\s+/g, ' ').trim(),
			};
		}).filter((row) => row.name.length > 0),
	);

const collectActiveFilterChipTexts = async (page) =>
	page.locator('button').evaluateAll((items) =>
		items
			.map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim())
			.filter((text) => text.includes('Search “') || text.includes('Search "')),
	);

const collectTimeoutBannerTexts = async (page) =>
	page.locator('section[aria-label="Activities list"] div').evaluateAll((items) =>
		items
			.map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim())
			.filter((text) => /timed out|failed to load activities|search could not be completed/i.test(text)),
	);

const collectBrowseNoiseRows = (rows) =>
	rows.filter((row) => /running|walking|park/i.test(`${row.name} ${row.subtitle ?? ''}`));

const extractStageIds = (response, stageKey) =>
	new Set(((response?.debug?.stageItems?.[stageKey]) ?? []).map((item) => item.placeId).filter(Boolean));

const classifyVenueFailure = (venue, run, venueDbState) => {
	const dbState = venueDbState.get(venue.placeId) ?? { place: null, mappedActivities: [] };
	if (!dbState.place) {
		return { status: 'absent from DB', firstStage: 'db' };
	}

	const mappedActivities = dbState.mappedActivities.filter((row) => row.activity_id === 3 || row.activity_id === 17);
	if (!mappedActivities.length) {
		return { status: 'present but unmapped', firstStage: 'mapping' };
	}

	const apiRows = run.apiRows.filter((row) => row.placeId === venue.placeId || row.name === venue.name);
	const uiRows = run.sidebarRows.filter((row) => row.placeId === venue.placeId || row.name === venue.name);
	if (apiRows.length && !uiRows.length) {
		return { status: 'dropped by stale UI / race condition', firstStage: 'ui' };
	}
	if (apiRows.length && uiRows.length) {
		return { status: 'present in final API and UI', firstStage: 'final' };
	}

	const response = run.apiResponse;
	const distance = haversineMeters(SCENARIO.center, { lat: dbState.place.lat, lng: dbState.place.lng });
	const requestRadius = run.requestRadiusMeters ?? 25_000;
	if (distance > requestRadius + 50) {
		return { status: 'excluded by viewport/in-bounds logic', firstStage: 'viewport' };
	}

	const fallbackMergeIds = extractStageIds(response, 'afterFallbackMerge');
	if (!fallbackMergeIds.has(venue.placeId)) {
		return { status: 'dropped by fallback sampling/paging bug', firstStage: 'afterFallbackMerge' };
	}
	const launchIds = extractStageIds(response, 'afterLaunchVisibility');
	if (!launchIds.has(venue.placeId)) {
		return { status: 'excluded by visibility gate', firstStage: 'afterLaunchVisibility' };
	}
	const metadataIds = extractStageIds(response, 'afterMetadataFilter');
	if (!metadataIds.has(venue.placeId)) {
		return { status: 'mapped but below threshold', firstStage: 'afterMetadataFilter' };
	}
	const confidenceIds = extractStageIds(response, 'afterConfidenceGate');
	if (!confidenceIds.has(venue.placeId)) {
		return { status: 'mapped but below threshold', firstStage: 'afterConfidenceGate' };
	}
	const dedupeIds = extractStageIds(response, 'afterDedupe');
	if (!dedupeIds.has(venue.placeId)) {
		return { status: 'dropped by dedupe', firstStage: 'afterDedupe' };
	}

	return { status: 'not classified', firstStage: 'unknown' };
};

const buildRunPass = (run) => {
	const expectedNames = [...EXPECTED_NAME_SET].sort();
	const apiNames = run.apiRows.map((row) => row.name).sort();
	const domNames = run.domRows.map((row) => row.name).sort();
	const sidebarNames = run.sidebarRows.map((row) => row.name).sort();
	const exactExpected = arraysEqual(apiNames, expectedNames) && arraysEqual(domNames, expectedNames) && arraysEqual(sidebarNames, expectedNames);
	const uiMatchesApi = arraysEqual(domNames, apiNames) && arraysEqual(sidebarNames, apiNames);
	return exactExpected
		&& uiMatchesApi
		&& !run.timeoutFlag
		&& !run.staleBrowseLeakFlag
		&& run.browseNoiseRows.length === 0
		&& !run.requestUiMismatch;
};

const buildMarkdown = ({ outputDir, runs, venueRows }) => {
	const scenarioLine = `- Center: ${SCENARIO.center.lat}, ${SCENARIO.center.lng}\n- Query: ${SCENARIO.query}\n- Server URL: ${BASE_URL}\n- Route: ${SCENARIO.route}`;
	const runTable = [
		'| Run | UI center | UI radius | Active chip | Request URL | Request radius | Response | API rows | Visible sidebar rows | Timeout | Browse noise | Request/UI mismatch | Screenshot | PASS |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
		...runs.map((run) => `| ${run.run} | ${run.uiCenter ? `${run.uiCenter.lat}, ${run.uiCenter.lng}` : 'null'} | ${run.uiRadiusLabel} | ${run.activeFilterChipText ?? 'none'} | ${run.requestUrl} | ${run.requestRadiusMeters} | ${run.responseStatus} | ${formatRowList(run.apiRows)} | ${formatRowList(run.sidebarRows)} | ${run.timeoutFlag ? 'yes' : 'no'} | ${run.browseNoiseRows.length ? formatNameList(run.browseNoiseRows.map((row) => row.name)) : 'no'} | ${run.requestUiMismatch ? 'yes' : 'no'} | ${run.screenshotRelativePath} | ${run.pass ? 'PASS' : 'FAIL'} |`),
	].join('\n');
	const venueTable = [
		'| Venue | DB present | Mapped | API appearances | Sidebar appearances | First elimination stage | Classification |',
		'| --- | --- | --- | --- | --- | --- | --- |',
		...venueRows.map((row) => `| ${row.name} | ${row.dbPresent ? 'yes' : 'no'} | ${row.mapped ? 'yes' : 'no'} | ${row.apiAppearances}/${RUN_COUNT} | ${row.sidebarAppearances}/${RUN_COUNT} | ${row.firstEliminationStage} | ${row.classification} |`),
	].join('\n');

	return `# Strict Hanoi climb live verification\n\n${scenarioLine}\n\n## Runs\n\n${runTable}\n\n## Venues\n\n${venueTable}\n\n- Output directory: ${outputDir}\n`;
};

const main = async () => {
	const outputDir = path.join(OUTPUT_ROOT, timestamp());
	await ensureDir(outputDir);
	await ensureDir(path.join(outputDir, 'screenshots'));

	const venueDbState = await collectVenueDbState();
	const browser = await chromium.launch({ headless: true });
	const runs = [];

	try {
		for (let run = 1; run <= RUN_COUNT; run += 1) {
			console.log(`[run ${run}/${RUN_COUNT}] start`);
			const context = await browser.newContext({
				baseURL: BASE_URL,
				geolocation: { latitude: SCENARIO.center.lat, longitude: SCENARIO.center.lng },
				permissions: ['geolocation'],
				viewport: { width: 1440, height: 1100 },
			});
			try {
				const page = await context.newPage();
				const nearbyResponses = [];

				page.on('response', async (response) => {
					if (!response.url().includes('/api/nearby')) return;
					try {
						const json = await response.json();
						nearbyResponses.push({ url: response.url(), status: response.status(), body: json });
					} catch {
						nearbyResponses.push({ url: response.url(), status: response.status(), body: null });
					}
				});

				await page.goto(SCENARIO.route, { waitUntil: 'domcontentloaded', timeout: SEARCH_TIMEOUT_MS });
				await waitForInitialActivitiesList(page);
				await page.waitForTimeout(2_000);
				await resetTruthPass(page);
				const { uiRadiusLabel } = await applyStrictSearch(page, SCENARIO.query);
				await waitForStrictTruthPass(page, SCENARIO.query);

				const truthPass = await page.evaluate(() => window.__HANOI_TRUTH_PASS__);
				const strictRequest = [...(truthPass?.nearbyRequests ?? [])]
					.reverse()
					.find((entry) => entry.mode === 'strict' && entry.queryText === SCENARIO.query && entry.finishedAt);
				const strictResponse = [...nearbyResponses]
					.reverse()
					.find((entry) => urlQueryText(entry.url) === SCENARIO.query)
					?? null;
				if (!strictResponse?.body) {
					throw new Error(`Run ${run}: strict climb request was not captured.`);
				}
				const requestMeta = strictRequest ?? parseRequestMetaFromUrl(strictResponse.url);

				const apiRows = (strictResponse.body.activities ?? []).map((row) => ({
					id: row.id ?? null,
					placeId: row.place_id ?? null,
					name: row.name ?? null,
				}));
				const sidebarRows = (truthPass?.uiState?.visibleActivities ?? []).map((row) => ({
					id: row.id ?? null,
					placeId: row.placeId ?? null,
					name: row.name ?? null,
				}));
				const domRows = await collectDomRows(page);
				const activeFilterChips = await collectActiveFilterChipTexts(page);
				const timeoutBannerTexts = await collectTimeoutBannerTexts(page);
				const timeoutFlag = Boolean(truthPass?.uiState?.requestTimedOutInUi)
					|| /timed out/i.test(truthPass?.uiState?.errorMessage ?? '')
					|| timeoutBannerTexts.length > 0;
				const unexpectedApiNames = apiRows.map((row) => row.name).filter((name) => name && !EXPECTED_NAME_SET.has(name));
				const unexpectedDomNames = domRows.map((row) => row.name).filter((name) => name && !EXPECTED_NAME_SET.has(name));
				const browseNoiseRows = collectBrowseNoiseRows(domRows);
				const requestUiMismatch = (truthPass?.uiState?.radiusMeters ?? null) !== requestMeta.radiusMeters;
				const staleBrowseLeakFlag = Boolean(truthPass?.uiState?.staleBrowseRowsRendered)
					|| truthPass?.uiState?.renderState !== 'strict-results'
					|| unexpectedApiNames.length > 0
					|| unexpectedDomNames.length > 0
					|| browseNoiseRows.length > 0;

				const screenshotRelativePath = path.join('screenshots', `run-${String(run).padStart(2, '0')}.png`);
				await page.screenshot({ path: path.join(outputDir, screenshotRelativePath), fullPage: true });

				const runResult = {
					run,
					uiCenter: truthPass?.uiState?.centerLat != null && truthPass?.uiState?.centerLng != null
						? { lat: truthPass.uiState.centerLat, lng: truthPass.uiState.centerLng }
						: null,
					uiRadiusMeters: truthPass?.uiState?.radiusMeters ?? null,
					uiRadiusLabel,
					activeFilterChipText: activeFilterChips[0] ?? null,
					requestUrl: requestMeta.url,
					requestRadiusMeters: requestMeta.radiusMeters,
					requestCenter: { lat: requestMeta.centerLat, lng: requestMeta.centerLng },
					requestUiMismatch,
					responseStatus: strictResponse.status,
					apiRows,
					sidebarRows,
					domRows,
					timeoutFlag,
					timeoutBannerTexts,
					staleBrowseLeakFlag,
					browseNoiseRows,
					screenshotRelativePath,
					apiResponse: strictResponse.body,
					uiState: truthPass?.uiState ?? null,
				};
				runResult.pass = buildRunPass(runResult);
				runs.push(runResult);
				console.log(`[run ${run}/${RUN_COUNT}] ${runResult.pass ? 'PASS' : 'FAIL'}`);
			} finally {
				await context.close().catch(() => undefined);
			}
		}
	} finally {
		await browser.close();
	}

	const venueRows = EXPECTED_VENUES.map((venue) => {
		const dbState = venueDbState.get(venue.placeId) ?? { place: null, mappedActivities: [] };
		const failingRun = runs.find((run) => !run.apiRows.some((row) => row.placeId === venue.placeId || row.name === venue.name)
			|| !run.sidebarRows.some((row) => row.placeId === venue.placeId || row.name === venue.name));
		const classification = failingRun
			? classifyVenueFailure(venue, failingRun, venueDbState)
			: { status: 'present in final API and UI', firstStage: 'final' };

		return {
			name: venue.name,
			placeId: venue.placeId,
			dbPresent: Boolean(dbState.place),
			mapped: (dbState.mappedActivities ?? []).some((row) => row.activity_id === 3 || row.activity_id === 17),
			apiAppearances: runs.filter((run) => run.apiRows.some((row) => row.placeId === venue.placeId || row.name === venue.name)).length,
			sidebarAppearances: runs.filter((run) => run.sidebarRows.some((row) => row.placeId === venue.placeId || row.name === venue.name)).length,
			firstEliminationStage: classification.firstStage,
			classification: classification.status,
		};
	});

	const consistentApi = runs.every((run) => arraysEqual(run.apiRows.map((row) => row.name).sort(), runs[0].apiRows.map((row) => row.name).sort()));
	const consistentSidebar = runs.every((run) => arraysEqual(run.sidebarRows.map((row) => row.name).sort(), runs[0].sidebarRows.map((row) => row.name).sort()));
	const summary = {
		generatedAt: new Date().toISOString(),
		baseUrl: BASE_URL,
		scenario: {
			center: SCENARIO.center,
			query: SCENARIO.query,
			route: SCENARIO.route,
		},
		overallPass: runs.every((run) => run.pass) && consistentApi && consistentSidebar,
		consistentApi,
		consistentSidebar,
		runs,
		venues: venueRows,
	};

	await fs.writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
	await fs.writeFile(path.join(outputDir, 'evidence.md'), `${buildMarkdown({ outputDir, runs, venueRows })}\n`);

	console.log(JSON.stringify({ outputDir, overallPass: summary.overallPass, consistentApi, consistentSidebar }, null, 2));
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
