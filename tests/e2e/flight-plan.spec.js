import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const tile = readFileSync(
	new URL('../fixtures/flight-plan-terrain/16-34823-22978.webp', import.meta.url)
);
function coordinate(x, y) {
	const size = 512 * 2 ** 16;
	return [
		((34823 * 512 + x) / size) * 360 - 180,
		(Math.atan(Math.sinh(Math.PI * (1 - (2 * (22978 * 512 + y)) / size))) * 180) / Math.PI
	];
}
const geometry = {
	type: 'Polygon',
	coordinates: [
		[
			[150, 409],
			[162, 409],
			[162, 415],
			[150, 415],
			[150, 409]
		].map(([x, y]) => coordinate(x, y))
	]
};
const options = {
	standOffMeters: 50,
	pointSpacingMeters: 5,
	stripSpacingMeters: 10,
	convergentPasses: 1
};

test('real DEM pixels are decoded and calculated in a responsive background worker', async ({
	page,
	context
}) => {
	test.setTimeout(60000);
	const requests = [];
	const workers = [];
	page.on('worker', (worker) => workers.push(worker.url()));
	await context.route('https://tiles.mapterhorn.com/**', (route) => {
		requests.push(route.request().url());
		if (!route.request().url().endsWith('/16/34823/22978.webp'))
			return route.fulfill({ status: 404 });
		return route.fulfill({
			body: tile,
			contentType: 'image/webp',
			headers: { 'access-control-allow-origin': '*' }
		});
	});
	await page.goto('/');
	const result = await page.evaluate(
		async ({ geometry, options }) => {
			const { generateFlightPlanInWorker } =
				await import('/src/lib/assets/js/flight-plan-client.ts');
			let ticks = 0;
			const progress = [];
			const timer = setInterval(() => ticks++, 5);
			try {
				const plan = await generateFlightPlanInWorker(geometry, options, {
					onProgress: (message) => progress.push(message)
				});
				return { count: plan.waypoints.length, metadata: plan.metadata, ticks, progress };
			} finally {
				clearInterval(timer);
			}
		},
		{ geometry, options }
	);
	expect(result.count).toBeGreaterThanOrEqual(6);
	expect(result.metadata.terrainZoom).toBe(16);
	expect(result.metadata.sectorMinimumElevation).toBeCloseTo(889.75, 4);
	expect(result.metadata.sectorMaximumElevation).toBeCloseTo(893.0625, 4);
	expect(result.metadata.terrainClearanceMethod).toBe('source-aligned-bvh-with-local-fallback');
	expect(result.ticks).toBeGreaterThan(0);
	expect(result.progress).toContain('Calculating flight path…');
	expect(workers.some((url) => url.includes('flight-plan.worker'))).toBe(true);
	expect(requests).toEqual(['https://tiles.mapterhorn.com/16/34823/22978.webp']);
});

test('worker reports missing terrain and supports cancellation', async ({ page, context }) => {
	await context.route('https://tiles.mapterhorn.com/**', (route) =>
		route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } })
	);
	await page.goto('/');
	const result = await page.evaluate(
		async ({ geometry, options }) => {
			const { generateFlightPlanInWorker } =
				await import('/src/lib/assets/js/flight-plan-client.ts');
			let failure;
			try {
				await generateFlightPlanInWorker(geometry, options);
			} catch (error) {
				failure = error.message;
			}
			const controller = new AbortController();
			const request = generateFlightPlanInWorker(geometry, options, { signal: controller.signal });
			controller.abort();
			let cancelled;
			try {
				await request;
			} catch (error) {
				cancelled = error.name;
			}
			return { failure, cancelled };
		},
		{ geometry, options }
	);
	expect(result.failure).toContain('Terrain could not be loaded (404)');
	expect(result.cancelled).toBe('AbortError');
});

test('source pixels stay continuous across a real two-tile boundary', async ({ page, context }) => {
	const east = readFileSync(
		new URL('../fixtures/flight-plan-terrain/16-34824-22978.webp', import.meta.url)
	);
	const requests = [];
	await context.route('https://tiles.mapterhorn.com/**', (route) => {
		const url = route.request().url();
		requests.push(url);
		const body = url.endsWith('/16/34823/22978.webp')
			? tile
			: url.endsWith('/16/34824/22978.webp')
				? east
				: null;
		return route.fulfill({
			status: body ? 200 : 404,
			body: body ?? '',
			contentType: 'image/webp',
			headers: { 'access-control-allow-origin': '*' }
		});
	});
	await page.goto('/');
	const geometry = {
		type: 'Polygon',
		coordinates: [
			[
				[506, 287],
				[518, 287],
				[518, 293],
				[506, 293],
				[506, 287]
			].map(([x, y]) => coordinate(x, y))
		]
	};
	const result = await page.evaluate(
		async ({ geometry, options }) => {
			const { generateFlightPlanInWorker } =
				await import('/src/lib/assets/js/flight-plan-client.ts');
			const plan = await generateFlightPlanInWorker(geometry, options);
			return {
				count: plan.waypoints.length,
				min: plan.metadata.sectorMinimumElevation,
				max: plan.metadata.sectorMaximumElevation
			};
		},
		{ geometry, options }
	);
	expect(result.count).toBeGreaterThanOrEqual(6);
	expect(result.min).toBeCloseTo(956.1875, 4);
	expect(result.max).toBeCloseTo(972.40625, 4);
	expect(requests.sort()).toEqual([
		'https://tiles.mapterhorn.com/16/34823/22978.webp',
		'https://tiles.mapterhorn.com/16/34824/22978.webp'
	]);
});
