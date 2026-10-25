import assert from 'node:assert/strict';
import fixtures from './fixtures/flight-plan-terrain/native-dem.json';
import { test } from 'vitest';
import { createSnapshotClearance } from '../src/lib/assets/js/flight-plan-mesh.ts';
import {
	snapshotElevationAt,
	geographicCoordinate,
	localCoordinate,
	pixelCoordinate,
	decodeTerrarium,
	validateTerrainSnapshot
} from '../src/lib/assets/js/flight-plan-snapshot.ts';
import { terrainSurfaceClearance } from '../src/lib/assets/js/flight-plan-terrain.ts';
import {
	generateFlightPlan,
	flightPlanTerrainBounds
} from '../src/lib/assets/js/flight-plan-generator.ts';
import { generateFlightPlanFromSnapshot } from '../src/lib/assets/js/flight-plan-job.ts';

for (const data of fixtures.cases) {
	test(`source-aligned clearance preserves rejection decisions on real ${data.name} DEM pixels`, () => {
		const snapshot = { ...data, elevations: new Float64Array(data.elevations) };
		const mesh = createSnapshotClearance(snapshot, 2, 1);
		const terrainAt = (local) =>
			snapshotElevationAt(snapshot, ...geographicCoordinate(snapshot, local));
		let rejected = 0;
		try {
			for (let y = 12.25; y < snapshot.height - 12; y += 5.5)
				for (let x = 12.35; x < snapshot.width - 12; x += 5.25) {
					const coordinate = pixelCoordinate(
						snapshot.firstPixelX + x,
						snapshot.firstPixelY + y,
						snapshot.zoom
					);
					const local = localCoordinate(snapshot, ...coordinate);
					for (const height of [0.5, 2, 3, 8, 30]) {
						const altitude = terrainAt(local) + height;
						const expected = terrainSurfaceClearance(local, altitude, terrainAt, 2, 1);
						const actual = mesh.clearance(local, altitude);
						if (expected < 2)
							assert.ok(actual < 2, `unsafe sample ${x},${y},${height}: ${actual} vs ${expected}`);
						if (expected < 2) rejected++;
					}
				}
			assert.ok(rejected > 0, 'real terrain fixture must exercise unsafe clearances');
			const center = localCoordinate(
				snapshot,
				...pixelCoordinate(snapshot.firstPixelX + 32, snapshot.firstPixelY + 32, snapshot.zoom)
			);
			mesh.clearance(center, Math.max(...snapshot.elevations) + 1000);
			assert.ok(mesh.stats.bvhAccepted > 0);
			assert.ok(mesh.stats.fallbackSamples > 0);
		} finally {
			mesh.dispose();
		}
	});
}

test('native raster peaks are preserved at arbitrary local grid phases', () => {
	const data = fixtures.cases[0];
	const snapshot = { ...data, elevations: new Float64Array(data.width * data.height).fill(700) };
	snapshot.elevations[32 * data.width + 32] = 730;
	const coordinate = pixelCoordinate(data.firstPixelX + 32, data.firstPixelY + 32, data.zoom);
	assert.ok(Math.abs(snapshotElevationAt(snapshot, ...coordinate) - 730) < 1e-5);
	const local = localCoordinate(snapshot, ...coordinate);
	const mesh = createSnapshotClearance(snapshot, 2, 1);
	try {
		assert.ok(mesh.clearance(local, 729) < 2);
		assert.ok(mesh.stats.fallbackSamples > 0);
	} finally {
		mesh.dispose();
	}
});

test('missing DEM samples and out-of-coverage queries fail explicitly', () => {
	const snapshot = {
		...fixtures.cases[0],
		elevations: new Float64Array(fixtures.cases[0].elevations)
	};
	snapshot.elevations[0] = NaN;
	assert.throws(() => validateTerrainSnapshot(snapshot), /unavailable/);
	assert.throws(() => snapshotElevationAt(snapshot, 0, 0), /beyond the terrain snapshot/);
	assert.deepEqual([...decodeTerrarium(new Uint8ClampedArray([130, 188, 128, 255]))], [700.5]);
	assert.ok(Number.isNaN(decodeTerrarium(new Uint8ClampedArray([130, 188, 0, 0]))[0]));
});

test('work limits reject invalid and excessive requests before calculations grow', () => {
	const geometry = {
		type: 'Polygon',
		coordinates: [
			[
				[11, 47],
				[11.002, 47],
				[11.002, 47.0003],
				[11, 47.0003],
				[11, 47]
			]
		]
	};
	for (const key of ['pointSpacingMeters', 'stripSpacingMeters', 'terrainMeshSpacingMeters']) {
		for (const value of [0, -1, NaN, Infinity])
			assert.throws(
				() => generateFlightPlan(geometry, { [key]: value }),
				/must be greater than zero/
			);
	}
	assert.throws(
		() => generateFlightPlan(geometry, { pointSpacingMeters: 1e-9 }),
		/Capture waypoints exceed/
	);
	assert.throws(
		() => generateFlightPlan(geometry, { terrainMeshSpacingMeters: 1e-9 }),
		/Clearance mesh vertices exceed/
	);
	assert.throws(
		() => generateFlightPlan(geometry, { wallDetectionSpacingMeters: 1e-9 }),
		/Wall sections exceed/
	);
	assert.throws(
		() => flightPlanTerrainBounds(geometry, { pointSpacingMeters: 0 }),
		/pointSpacingMeters/
	);
});

test('fixed snapshot generation retains conservative clearances on real terrain', () => {
	const data = fixtures.cases[0];
	const snapshot = { ...data, elevations: new Float64Array(data.elevations) };
	const coords = [
		[26, 28],
		[38, 28],
		[38, 34],
		[26, 34],
		[26, 28]
	].map(([x, y]) => pixelCoordinate(data.firstPixelX + x, data.firstPixelY + y, data.zoom));
	const geometry = { type: 'Polygon', coordinates: [coords] };
	const options = { standOffMeters: 3, pointSpacingMeters: 3, stripSpacingMeters: 8 };
	const run = (fn) => {
		try {
			return { plan: fn() };
		} catch (error) {
			return { error: error.message };
		}
	};
	const local = run(() =>
		generateFlightPlan(geometry, {
			...options,
			terrainElevationAt: (lon, lat) => snapshotElevationAt(snapshot, lon, lat)
		})
	);
	const shared = run(() => generateFlightPlanFromSnapshot(geometry, options, snapshot));
	assert.equal(local.error, undefined);
	assert.equal(shared.error, undefined);
	assert.deepEqual(shared.plan.wallDetection, local.plan.wallDetection);
	assert.ok(shared.plan.metadata.droppedWaypointCount >= local.plan.metadata.droppedWaypointCount);
	const alignedSnapshot = {
		...snapshot,
		origin: flightPlanTerrainBounds(geometry, options).origin
	};
	const terrainAt = (local) =>
		snapshotElevationAt(alignedSnapshot, ...geographicCoordinate(alignedSnapshot, local));
	for (let index = 1; index < shared.plan.waypoints.length; index++) {
		const first = shared.plan.waypoints[index - 1],
			second = shared.plan.waypoints[index];
		const from = localCoordinate(alignedSnapshot, first.longitude, first.latitude);
		const to = localCoordinate(alignedSnapshot, second.longitude, second.latitude);
		const count = Math.max(
			1,
			Math.ceil(
				Math.hypot(to[0] - from[0], to[1] - from[1], second.altitude - first.altitude) / 0.5
			)
		);
		for (let sample = 0; sample <= count; sample++) {
			const t = sample / count;
			const point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
			const altitude = first.altitude + (second.altitude - first.altitude) * t;
			assert.ok(altitude - terrainAt(point) >= 3 - 1e-6);
			assert.ok(terrainSurfaceClearance(point, altitude, terrainAt, 2, 1) >= 2 - 1e-6);
		}
	}
});

test('distant raster roughness does not reject clearance above a flat local patch', () => {
	const data = fixtures.cases[0];
	const snapshot = { ...data, elevations: new Float64Array(data.width * data.height).fill(700) };
	snapshot.elevations[2 * data.width + 2] = 740;
	const local = localCoordinate(
		snapshot,
		...pixelCoordinate(data.firstPixelX + 32, data.firstPixelY + 32, data.zoom)
	);
	const mesh = createSnapshotClearance(snapshot, 2, 1);
	try {
		assert.ok(mesh.clearance(local, 703) >= 2);
		assert.ok(mesh.clearance(local, 701) < 2);
	} finally {
		mesh.dispose();
	}
});
