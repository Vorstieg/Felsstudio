import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	generateFlightPlan,
	validateFlightPlanOptions
} from '../src/lib/assets/js/flight-plan-generator.ts';
import {
	cameraFootprint,
	cameraContainsTarget,
	flightCamera,
	selectCoverageCamera
} from '../src/lib/assets/js/flight-plan-camera.ts';
import { terrainSurfaceClearance } from '../src/lib/assets/js/flight-plan-terrain.ts';
import { exportFlightPlanWaylinesWpml } from '../src/lib/assets/js/flight-plan-kml.ts';

const latitudeScale = (Math.PI / 180) * 6378137;
const longitudeScale = latitudeScale * Math.cos((47 * Math.PI) / 180);
const coordinate = (x, y) => [11 + x / longitudeScale, 47 + y / latitudeScale];
const local = (longitude, latitude) => [
	(longitude - 11) * longitudeScale,
	(latitude - 47) * latitudeScale
];
const ring = [
	[-30, -8],
	[30, -8],
	[30, 8],
	[-30, 8],
	[-30, -8]
].map(([x, y]) => coordinate(x, y));
const sector = { type: 'Polygon', coordinates: [ring] };
const ramp = (value, low, high) => Math.max(0, Math.min(1, (value - low) / (high - low)));
const heightAt = (x) => 22 + 4 * Math.sin(x / 20);
const terrain = (longitude, latitude) => {
	const [x, y] = local(longitude, latitude);
	return 700 + 8 * ramp(y, -6, -4) + (heightAt(x) - 8) * ramp(y, 0, 4);
};
const captures = (plan) => plan.waypoints.filter((waypoint) => waypoint.phase === 'capture');
const photosOfKind = (plan, kind) =>
	captures(plan).filter((waypoint) => waypoint.captureKind === kind);

function assertSafePath(plan, terrainAt) {
	const minimumGround =
		plan.metadata.minimumGroundClearanceMeters + plan.metadata.clearanceMarginMeters;
	const minimumFace = plan.metadata.minimumFaceDistanceMeters + plan.metadata.clearanceMarginMeters;
	for (let index = 1; index < plan.waypoints.length; index++) {
		const first = plan.waypoints[index - 1],
			second = plan.waypoints[index];
		const from = local(first.longitude, first.latitude),
			to = local(second.longitude, second.latitude);
		const count = Math.max(
			1,
			Math.ceil(
				Math.hypot(to[0] - from[0], to[1] - from[1], second.altitude - first.altitude) / 0.25
			)
		);
		for (let sample = 0; sample <= count; sample++) {
			const fraction = sample / count;
			const point = [
				from[0] + (to[0] - from[0]) * fraction,
				from[1] + (to[1] - from[1]) * fraction
			];
			const altitude = first.altitude + (second.altitude - first.altitude) * fraction;
			const [longitude, latitude] = coordinate(...point);
			assert.ok(altitude - terrainAt(longitude, latitude) >= minimumGround - 1e-5);
			assert.ok(
				terrainSurfaceClearance(
					point,
					altitude,
					(p) => terrainAt(...coordinate(...p)),
					minimumFace,
					1
				) >=
					minimumFace - 1e-5
			);
		}
	}
}

for (const pattern of ['facade-grid', 'constant-distance-grid', 'half-helix', 'curved-sweep']) {
	test(`${pattern} aims each photo at its real 3D surface target, including the crest`, () => {
		const options = { pattern, terrainElevationAt: terrain };
		const plan = generateFlightPlan(sector, options);
		assert.equal(plan.metadata.coverageStatus, 'modeled');
		assert.equal(plan.metadata.uncoveredTargetCount, 0);
		assert.equal(plan.metadata.coveredCrestTargetCount, plan.metadata.crestTargetCount);
		assert.ok(plan.metadata.crestTargetCount > 2);
		assert.equal(plan.metadata.discardedFragmentWaypointCount, 0);
		assert.equal(plan.metadata.coveragePasses, 1);
		assert.equal(photosOfKind(plan, 'grid').length, plan.metadata.gridWaypointCount);
		assert.ok(photosOfKind(plan, 'grid').every((waypoint) => waypoint.captureView === 'face'));
		assert.ok(plan.metadata.standOffMeters > plan.metadata.minimumFaceDistanceMeters);
		const photos = captures(plan);
		assert.equal(
			plan.metadata.photoCount,
			photos.length + photos.filter((waypoint) => waypoint.detailCamera).length
		);
		const pitches = new Set();
		for (const waypoint of photos) {
			const target = waypoint.captureTarget;
			const from = local(waypoint.longitude, waypoint.latitude),
				to = local(target.longitude, target.latitude);
			const horizontal = Math.hypot(to[0] - from[0], to[1] - from[1]);
			const expectedPitch =
				(Math.atan2(target.altitude - waypoint.altitude, horizontal) * 180) / Math.PI;
			assert.ok(Math.abs(waypoint.gimbalPitch - expectedPitch) < 1e-5);
			const expectedHeading =
				((Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI + 360) % 360;
			assert.ok(Math.abs(((waypoint.heading - expectedHeading + 540) % 360) - 180) < 1e-5);
			assert.ok(Math.abs(target.altitude - terrain(target.longitude, target.latitude)) < 0.1);
			assert.ok(waypoint.gimbalPitch >= -90 && waypoint.gimbalPitch <= 70);
			pitches.add(Math.round(waypoint.gimbalPitch));
			// A clear aircraft position alone does not prove that its target is visible.
			const count = Math.max(1, Math.ceil(horizontal / 0.1));
			for (let sample = 1; sample < count; sample++) {
				const fraction = sample / count;
				const point = [
					from[0] + (to[0] - from[0]) * fraction,
					from[1] + (to[1] - from[1]) * fraction
				];
				const altitude = waypoint.altitude + (target.altitude - waypoint.altitude) * fraction;
				assert.ok(altitude + 0.1 >= terrain(...coordinate(...point)));
			}
			if (waypoint.captureView === 'crest') {
				assert.ok(waypoint.altitude > target.altitude + 2);
				assert.ok(target.altitude >= 700 + heightAt(to[0]) - 0.1);
			}
		}
		assert.ok(pitches.size > 3, 'clearance lifts and oblique views must change pitch');
		assert.ok(
			photos.some(
				(waypoint) => waypoint.captureView === 'face' && waypoint.captureTarget.altitude < 701
			)
		);
		assert.ok(photos.some((waypoint) => waypoint.captureTarget.altitude > 724));
		const grid = photosOfKind(plan, 'grid');
		assert.equal(
			new Set(grid.map((waypoint) => JSON.stringify(waypoint.captureTarget))).size,
			grid.length,
			'the main grid must visit each target only once'
		);
		assert.deepEqual(
			plan.waypoints.map((waypoint) => waypoint.index),
			plan.waypoints.map((_, index) => index)
		);
		assert.equal(
			plan.waypoints.some((waypoint) => 'local' in waypoint || 'coverageKey' in waypoint),
			false
		);
		if (pattern === 'constant-distance-grid') {
			assertSafePath(plan, terrain);
			assert.deepEqual(plan, generateFlightPlan(sector, options));
		}
	});
}

test('camera choice and photo spacing depend on optics and distance', () => {
	assert.equal(selectCoverageCamera(8, 0.5), 'wide');
	assert.equal(selectCoverageCamera(35, 0.5), 'tele-3x');
	assert.equal(selectCoverageCamera(100, 0.5), 'tele-6x');
	const plan = generateFlightPlan(sector, { terrainElevationAt: terrain });
	const footprint = cameraFootprint(plan.metadata.camera, plan.metadata.standOffMeters);
	assert.ok(
		plan.metadata.pointSpacingMeters <= footprint.width * (1 - plan.metadata.captureOverlap)
	);
	assert.ok(
		plan.metadata.stripSpacingMeters <= footprint.height * (1 - plan.metadata.captureOverlap)
	);
	for (const waypoint of captures(plan).filter((waypoint) => waypoint.detailCamera)) {
		const from = local(waypoint.longitude, waypoint.latitude);
		const target = waypoint.captureTarget,
			to = local(target.longitude, target.latitude);
		assert.ok(
			Math.hypot(to[0] - from[0], to[1] - from[1], target.altitude - waypoint.altitude) >=
				flightCamera(waypoint.detailCamera).minimumFocus
		);
	}
});

test('a blocked connection gets transits and a blocked mission never exports', () => {
	const options = {
		pattern: 'constant-distance-grid',
		camera: 'wide',
		standOffMeters: 20,
		clearanceMarginMeters: 0,
		terrainElevationAt: () => 700
	};
	const baseline = generateFlightPlan(sector, options);
	const [a, b] = captures(baseline);
	const ridgeLongitude = (a.longitude + b.longitude) / 2;
	const ridge = (longitude) =>
		Math.abs(longitude - ridgeLongitude) * longitudeScale < 0.4 ? 708 : 700;
	const plan = generateFlightPlan(sector, { ...options, terrainElevationAt: ridge });
	assert.ok(plan.waypoints.some((waypoint) => waypoint.phase === 'transit'));
	assertSafePath(plan, ridge);
	for (const waypoint of plan.waypoints.filter((waypoint) => waypoint.phase === 'transit')) {
		assert.equal(waypoint.detailCamera, undefined);
		assert.equal(waypoint.captureTarget, undefined);
	}
	assert.throws(
		() => generateFlightPlan(sector, { ...options, terrainClearanceAt: () => 0 }),
		/No usable flight path/
	);
	assert.throws(
		() =>
			exportFlightPlanWaylinesWpml({
				...plan,
				metadata: { ...plan.metadata, coverageStatus: 'partial', startElevation: 680 }
			}),
		/uncovered or unresolved/
	);
	assert.throws(
		() => generateFlightPlan(sector, { ...options, terrainClearanceAt: () => NaN }),
		/No usable flight path/
	);
	assert.equal(baseline.metadata.coverageStatus, 'unresolved');
	assert.throws(
		() =>
			exportFlightPlanWaylinesWpml({
				...baseline,
				metadata: { ...baseline.metadata, startElevation: 680 }
			}),
		/uncovered or unresolved/
	);
});

test('clearance margin is enforced and invalid requests fail before work grows', () => {
	for (const key of [
		'pointSpacingMeters',
		'stripSpacingMeters',
		'terrainMeshSpacingMeters',
		'targetGsdCm'
	])
		for (const value of [0, -1, NaN, Infinity])
			assert.throws(() => generateFlightPlan(sector, { [key]: value }), /greater than zero/);
	for (const options of [
		{ camera: 'unknown' },
		{ captureOverlap: 0.1 },
		{ clearanceMarginMeters: -1 },
		{ standOffMeters: 0.5 },
		{ minimumFaceDistanceMeters: 0.5 },
		{ startElevation: NaN }
	])
		assert.throws(() => validateFlightPlanOptions(options));
	assert.throws(
		() => generateFlightPlan(sector, { pointSpacingMeters: 1e-9 }),
		/Capture waypoints exceed/
	);
	assert.throws(
		() => generateFlightPlan(sector, { wallDetectionSpacingMeters: 1e-9 }),
		/Wall sections exceed/
	);
	const plan = generateFlightPlan(sector, {
		terrainElevationAt: terrain,
		startElevation: 680,
		clearanceMarginMeters: 2
	});
	assert.equal(plan.metadata.startElevation, 680);
	assert.equal(plan.metadata.clearanceMarginMeters, 2);
	assert.ok(
		captures(plan).every(
			(waypoint) => waypoint.altitude - terrain(waypoint.longitude, waypoint.latitude) >= 5 - 1e-5
		)
	);
});

test('terrain caches belong to one generation', () => {
	let offset = 0;
	const options = {
		terrainElevationAt: (longitude, latitude) => terrain(longitude, latitude) + offset
	};
	const first = generateFlightPlan(sector, options);
	offset = 100;
	const second = generateFlightPlan(sector, options);
	assert.equal(second.waypoints.length, first.waypoints.length);
	for (let index = 0; index < first.waypoints.length; index++) {
		assert.ok(
			Math.abs(second.waypoints[index].altitude - first.waypoints[index].altitude - 100) < 1e-5
		);
		assert.ok(
			Math.abs(second.waypoints[index].gimbalPitch - first.waypoints[index].gimbalPitch) < 1e-5
		);
	}
});

test('orders single-grid row transitions by physical endpoint distance at high latitudes', () => {
	const latitude = 80;
	const latitudeScale = (Math.PI / 180) * 6378137;
	const longitudeScale = latitudeScale * Math.cos((latitude * Math.PI) / 180);
	const cosine = 0.5;
	const sine = -Math.sqrt(3) / 2;
	const coordinate = (along, across) => [
		11 + (cosine * along - sine * across) / longitudeScale,
		latitude + (sine * along + cosine * across) / latitudeScale
	];
	const ring = [coordinate(-20, -15), coordinate(20, -15), coordinate(20, 15), coordinate(-20, 15)];
	const plan = generateFlightPlan(
		{ type: 'Polygon', coordinates: [[...ring, ring[0]]] },
		{
			pattern: 'constant-distance-grid',
			camera: 'wide',
			captureOverlap: 0.76,
			standOffMeters: 10,
			stripSpacingMeters: 8,
			pointSpacingMeters: 10,
			terrainElevationAt: (longitude, latitudeAt) => {
				const x = (longitude - 11) * longitudeScale;
				const y = (latitudeAt - latitude) * latitudeScale;
				const across = -sine * x + cosine * y;
				return 700 + (Math.max(0, Math.min(30, across + 15)) * 50) / 30;
			}
		}
	);
	const rows = [];
	for (const waypoint of photosOfKind(plan, 'grid')) {
		if (waypoint.rowBoundary === 'start' || waypoint.rowBoundary === 'single') rows.push([]);
		rows.at(-1).push(waypoint);
		assert.equal('local' in waypoint, false, 'local coordinates must stay internal');
	}
	for (let index = 1; index < rows.length; index += 1) {
		const previous = rows[index - 1].at(-1);
		const first = rows[index][0];
		const last = rows[index].at(-1);
		const distance = (point) =>
			Math.hypot(
				(point.longitude - previous.longitude) * longitudeScale,
				(point.latitude - previous.latitude) * latitudeScale
			);
		assert.ok(distance(first) <= distance(last) + 1e-6);
	}
});

test('preview generation retains an optional launch reference and rejects unavailable terrain', () => {
	const options = { terrainElevationAt: terrain };
	assert.equal(generateFlightPlan(sector, options).metadata.startElevation, undefined);
	assert.equal(
		generateFlightPlan(sector, { ...options, startElevation: 0 }).metadata.startElevation,
		0
	);
	assert.throws(
		() => generateFlightPlan(sector, { ...options, startElevation: NaN }),
		/Launch elevation/
	);
	assert.throws(
		() => generateFlightPlan(sector, { terrainElevationAt: () => NaN }),
		/finite elevation/
	);
	assert.throws(() => generateFlightPlan({ type: 'Point', coordinates: [11, 47] }), /Polygon/);
	assert.throws(() => flightCamera('toString'), /Unsupported capture camera/);
});

test('camera frusta distinguish pitched views and tele detail coverage', () => {
	const aircraft = [0, 0, 10];
	assert.equal(cameraContainsTarget('wide', aircraft, 0, -45, [0, 10, 0]), true);
	assert.equal(cameraContainsTarget('tele-6x', aircraft, 0, -45, [0, 10, 0]), true);
	assert.equal(cameraContainsTarget('tele-6x', aircraft, 0, 0, [0, 10, 0]), false);
	assert.equal(cameraContainsTarget('wide', aircraft, 0, -45, [3, 10, 0]), true);
	assert.equal(cameraContainsTarget('tele-6x', aircraft, 0, -45, [3, 10, 0]), false);
	assert.equal(cameraContainsTarget('wide', aircraft, 0, -45, [0, -10, 20]), false);
	assert.throws(
		() =>
			generateFlightPlan({
				type: 'Polygon',
				coordinates: [
					[
						[11, 47],
						[NaN, 47],
						[11.001, 47.001],
						[11, 47]
					]
				]
			}),
		/finite WGS84/
	);
});

test('detail controls distance and density independently of minimum clearance', () => {
	const plans = [1, 0.7, 0.5].map((targetGsdCm) =>
		generateFlightPlan(sector, {
			targetGsdCm,
			minimumFaceDistanceMeters: 2,
			terrainElevationAt: terrain
		})
	);
	for (const plan of plans) {
		assert.equal(plan.metadata.minimumFaceDistanceMeters, 2);
		assert.equal(plan.metadata.coverageStatus, 'modeled');
		assert.equal(plan.metadata.spacingGapCount, 0);
	}
	assert.ok(plans[0].metadata.standOffMeters > plans[1].metadata.standOffMeters);
	assert.ok(plans[1].metadata.standOffMeters > plans[2].metadata.standOffMeters);
	assert.ok(plans[0].waypoints.length < plans[1].waypoints.length);
	assert.ok(plans[1].waypoints.length < plans[2].waypoints.length);
	assert.ok(plans[2].waypoints.length < 1000);
});

test('one grid supplies the face views while only the top needs extra photos on a planar wall', () => {
	const plan = generateFlightPlan(sector, {
		pattern: 'constant-distance-grid',
		terrainElevationAt: (longitude, latitude) =>
			700 + 20 * ramp(local(longitude, latitude)[1], -4, 4)
	});
	const grid = photosOfKind(plan, 'grid'),
		extra = photosOfKind(plan, 'supplementary');
	assert.equal(plan.metadata.coveragePasses, 1);
	assert.equal(plan.metadata.coverageStatus, 'modeled');
	assert.equal(extra.filter((waypoint) => waypoint.captureView === 'face').length, 0);
	assert.ok(extra.some((waypoint) => waypoint.captureView === 'crest'));
	assert.ok(extra.length < grid.length / 3);
	assert.equal(plan.metadata.uncoveredTargetCount, 0);
	assert.equal(plan.metadata.spacingGapCount, 0);
	const level = generateFlightPlan(sector, { terrainElevationAt: () => 700 });
	const poses = photosOfKind(level, 'grid').map((waypoint) =>
		JSON.stringify([
			waypoint.longitude,
			waypoint.latitude,
			waypoint.altitude,
			waypoint.heading,
			waypoint.gimbalPitch
		])
	);
	assert.equal(
		new Set(poses).size,
		poses.length,
		'zero-height rows must reuse photos rather than duplicate the flight line'
	);
});

test('a narrow wall gets a targeted baseline instead of a second grid or duplicate endpoint views', () => {
	const coordinates = [
		[-1.5, -1],
		[1.5, -1],
		[1.5, 1],
		[-1.5, 1],
		[-1.5, -1]
	].map(([x, y]) => coordinate(x, y));
	const plan = generateFlightPlan(
		{ type: 'Polygon', coordinates: [coordinates] },
		{
			pattern: 'constant-distance-grid',
			terrainElevationAt: (longitude, latitude) =>
				700 + 2 * ramp(local(longitude, latitude)[1], -0.5, 0.5)
		}
	);
	assert.equal(plan.metadata.coverageStatus, 'modeled');
	assert.equal(plan.metadata.coveragePasses, 1);
	assert.ok(
		photosOfKind(plan, 'supplementary').some(
			(waypoint) => Math.abs(local(waypoint.longitude, waypoint.latitude)[0]) > 1.5
		)
	);
	assert.equal(plan.metadata.uncoveredTargetCount, 0);
	assert.equal(plan.metadata.spacingGapCount, 0);
});
