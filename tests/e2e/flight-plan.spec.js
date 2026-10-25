import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const oetkGeometry = JSON.parse(
	readFileSync(
		new URL('../fixtures/flight-plan-terrain/oetk-klettergarten.json', import.meta.url),
		'utf8'
	)
);
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
	standOffMeters: 10,
	pointSpacingMeters: 5,
	stripSpacingMeters: 10
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

for (const minimumDistance of [2, 5]) {
	test(`ÖTK constant-distance grid routes around terrain at ${minimumDistance} m`, async ({
		page,
		context
	}) => {
		test.setTimeout(60000);
		const terrain = readFileSync(
			new URL('../fixtures/flight-plan-terrain/16-35689-22827.webp', import.meta.url)
		);
		await context.route('https://tiles.mapterhorn.com/**', (route) =>
			route.fulfill({
				status: route.request().url().endsWith('/16/35689/22827.webp') ? 200 : 404,
				body: terrain,
				contentType: 'image/webp',
				headers: { 'access-control-allow-origin': '*' }
			})
		);
		await page.goto('/');
		const result = await page.evaluate(
			async ({ geometry, minimumDistance }) => {
				const { generateFlightPlanInWorker } =
					await import('/src/lib/assets/js/flight-plan-client.ts');
				const { exportFlightPlanWaylinesWpml } =
					await import('/src/lib/assets/js/flight-plan-kml.ts');
				const plan = await generateFlightPlanInWorker(geometry, {
					pattern: 'constant-distance-grid',
					standOffMeters: minimumDistance,
					minimumFaceDistanceMeters: minimumDistance
				});
				plan.metadata.startElevation = 830;
				return { plan, wpml: exportFlightPlanWaylinesWpml(plan) };
			},
			{ geometry: oetkGeometry, minimumDistance }
		);
		const capture = result.plan.waypoints.filter((waypoint) => waypoint.phase === 'capture');
		const transit = result.plan.waypoints.filter((waypoint) => waypoint.phase === 'transit');
		expect(capture.length).toBeGreaterThan(10);
		if (minimumDistance === 2) expect(transit.length).toBeGreaterThan(0);
		expect(result.plan.metadata.photoCount).toBe(
			capture.length + result.plan.metadata.detailPhotoCount
		);
		expect(result.plan.metadata.coverageStatus).toBe('modeled');
		expect(result.plan.metadata.uncoveredTargetCount).toBe(0);
		expect(result.plan.metadata.coveredCrestTargetCount).toBe(
			result.plan.metadata.crestTargetCount
		);
		expect(result.plan.metadata.detailPhotoCount).toBeGreaterThan(0);
		expect(result.plan.metadata.coveragePasses).toBe(1);
		expect(capture.filter((waypoint) => waypoint.captureKind === 'grid')).toHaveLength(
			result.plan.metadata.gridWaypointCount
		);
		expect(capture.filter((waypoint) => waypoint.captureKind === 'supplementary')).toHaveLength(
			result.plan.metadata.supplementaryWaypointCount
		);
		expect(
			capture.some((waypoint) => waypoint.captureView === 'crest' && waypoint.gimbalPitch < -20)
		).toBe(true);
		expect(result.plan.waypoints.map((waypoint) => waypoint.index)).toEqual(
			result.plan.waypoints.map((_, index) => index)
		);
		const placemarks = result.wpml.match(/<Placemark>[\s\S]*?<\/Placemark>/g);
		expect(placemarks).toHaveLength(result.plan.waypoints.length);
		for (const [index, waypoint] of result.plan.waypoints.entries()) {
			const photos =
				placemarks[index].match(/<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>/g) ||
				[];
			expect(photos).toHaveLength(
				waypoint.phase === 'capture' ? 1 + Number(Boolean(waypoint.detailCamera)) : 0
			);
			if (waypoint.phase === 'capture')
				expect(placemarks[index]).toContain(
					`<wpml:waypointGimbalPitchAngle>${waypoint.gimbalPitch.toFixed(8).replace(/(?:\.0+|(?<=\..*?)0+)$/, '')}</wpml:waypointGimbalPitchAngle>`
				);
		}
	});
}

test('ÖTK detail presets reduce density while retaining complete modeled coverage', async ({
	page,
	context
}) => {
	test.setTimeout(90000);
	const terrain = readFileSync(
		new URL('../fixtures/flight-plan-terrain/16-35689-22827.webp', import.meta.url)
	);
	await context.route('https://tiles.mapterhorn.com/**', (route) =>
		route.fulfill({
			status: route.request().url().endsWith('/16/35689/22827.webp') ? 200 : 404,
			body: terrain,
			contentType: 'image/webp',
			headers: { 'access-control-allow-origin': '*' }
		})
	);
	await page.goto('/');
	const results = await page.evaluate(async (geometry) => {
		const { generateFlightPlanInWorker } = await import('/src/lib/assets/js/flight-plan-client.ts');
		const results = [];
		for (const targetGsdCm of [1, 0.7, 0.5]) {
			const plan = await generateFlightPlanInWorker(geometry, {
				pattern: 'constant-distance-grid',
				targetGsdCm,
				minimumFaceDistanceMeters: 2
			});
			results.push({ count: plan.waypoints.length, metadata: plan.metadata });
		}
		return results;
	}, oetkGeometry);
	for (const { count, metadata } of results) {
		expect(count).toBeLessThan(400);
		expect(metadata.coveragePasses).toBe(1);
		expect(metadata.supplementaryWaypointCount).toBeLessThan(metadata.gridWaypointCount / 3);
		expect(metadata.minimumFaceDistanceMeters).toBe(2);
		expect(metadata.coverageStatus).toBe('modeled');
		expect(metadata.spacingGapCount).toBe(0);
		expect(metadata.uncoveredTargetCount).toBe(0);
		expect(metadata.coveredCrestTargetCount).toBe(metadata.crestTargetCount);
	}
	expect(results[2].metadata.supplementaryWaypointCount).toBeGreaterThan(0);
	expect(results[0].count).toBeLessThan(results[1].count);
	expect(results[1].count).toBeLessThan(results[2].count);
	expect(results[0].metadata.coverageTargetCount).toBeLessThan(
		results[1].metadata.coverageTargetCount
	);
	expect(results[1].metadata.coverageTargetCount).toBeLessThan(
		results[2].metadata.coverageTargetCount
	);
});
