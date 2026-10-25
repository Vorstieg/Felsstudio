import assert from 'node:assert/strict';
import { test } from 'vitest';
import { generateFlightPlan } from '../src/lib/assets/js/flight-plan-generator.ts';

test('generates valid deterministic flight plans', () => {
	const sector = {
		type: 'Polygon',
		coordinates: [
			[
				[11.0, 47.0],
				[11.002, 47.0],
				[11.002, 47.0003],
				[11.0, 47.0003],
				[11.0, 47.0]
			]
		]
	};
	const options = {
		cragName: 'Test wall',
		stripSpacingMeters: 10,
		pointSpacingMeters: 10,
		terrainElevationAt: () => 700
	};
	const plan = generateFlightPlan(sector, options);

	assert.equal(plan.cragName, 'Test wall');
	assert.equal(plan.metadata.pattern, 'facade-grid');
	assert.equal(plan.metadata.strategy, 'terrain-following-facade-with-convergent-pass');
	assert.equal(plan.metadata.convergentPasses, 2);
	assert.equal(plan.metadata.terrainSource, 'https://tiles.mapterhorn.com/tilejson.json');
	assert.equal(plan.metadata.captureHeightMeters, 0);
	assert.ok(
		plan.waypoints.every(
			(waypoint) => waypoint.phase === 'capture' && waypoint.camera === 'tele-6x'
		)
	);
	assert.equal(plan.waypoints[0].rowBoundary, 'start');
	assert.ok(plan.waypoints.every((waypoint) => waypoint.altitude >= 703));
	assert.ok(plan.waypoints.some((waypoint) => waypoint.rowBoundary === 'start'));
	assert.ok(plan.waypoints.some((waypoint) => waypoint.rowBoundary === 'end'));
	const directOnlyPlan = generateFlightPlan(sector, { ...options, convergentPasses: 1 });
	assert.equal(
		plan.waypoints.length,
		directOnlyPlan.waypoints.length * 2,
		'a second convergent pass should provide a second view of every coverage row'
	);
	assert.notEqual(
		plan.waypoints[0].heading,
		plan.waypoints[directOnlyPlan.waypoints.length].heading,
		'the convergent pass should look back to the face from a different viewpoint'
	);
	const constantDistancePlan = generateFlightPlan(sector, {
		...options,
		pattern: 'constant-distance-grid'
	});
	assert.equal(constantDistancePlan.metadata.pattern, 'constant-distance-grid');
	assert.ok(
		constantDistancePlan.waypoints.every((waypoint) => waypoint.altitude >= 703),
		'the constant-distance grid must retain vertical clearance above the wall base'
	);
	const surfaceFollowingPlan = generateFlightPlan(sector, {
		...options,
		pattern: 'constant-distance-grid',
		standOffMeters: 100,
		terrainElevationAt: (_longitude, latitude) => 700 + ((latitude - 47) * 20) / 0.0003
	});
	assert.equal(surfaceFollowingPlan.metadata.pattern, 'constant-distance-grid');
	const surfaceFollowingLatitudes = surfaceFollowingPlan.waypoints.map(
		(waypoint) => waypoint.latitude
	);
	assert.ok(
		Math.max(...surfaceFollowingLatitudes) - Math.min(...surfaceFollowingLatitudes) > 0.0001,
		'every capture layer should move horizontally as it follows the DEM wall surface'
	);
	assert.deepEqual(plan, generateFlightPlan(sector, options), 'generation must be deterministic');
	assert.throws(() => generateFlightPlan({ type: 'Point', coordinates: [11, 47] }));

	const tallSectorPlan = generateFlightPlan(sector, {
		...options,
		terrainElevationAt: (longitude) => 700 + ((longitude - 11) * 100) / 0.002
	});
	assert.ok(Math.abs(tallSectorPlan.metadata.captureHeightMeters - 100) < 0.0001);
	assert.ok(Math.abs(tallSectorPlan.metadata.sectorMinimumElevation - 700) < 0.0001);
	assert.ok(Math.abs(tallSectorPlan.metadata.sectorMaximumElevation - 800) < 0.0001);
	assert.ok(
		tallSectorPlan.waypoints.every(
			(waypoint) => waypoint.altitude - (700 + ((waypoint.longitude - 11) * 100) / 0.002) >= 3
		),
		'every waypoint must remain at least 3 m above the sampled ground'
	);
	assert.ok(
		tallSectorPlan.metadata.altitudeCappedWaypointCount > 0,
		'waypoints above the capture-altitude ceiling should be removed'
	);
	assert.ok(
		tallSectorPlan.waypoints.every(
			(waypoint) => waypoint.altitude <= tallSectorPlan.metadata.captureAltitudeCeiling
		),
		'no capture waypoint may exceed the lowest capture altitude plus face height and tolerance'
	);

	assert.throws(
		() =>
			generateFlightPlan(sector, {
				...options,
				terrainElevationAt: (longitude) => (longitude > 11.0008 && longitude < 11.0012 ? 720 : 700)
			}),
		/Unsafe flight path between waypoints/,
		'clipping rows must not leave an unchecked transition through high terrain'
	);
	assert.throws(
		() => generateFlightPlan(sector, { ...options, standOffMeters: 0.5 }),
		/standOffMeters must be at least 1 metre/
	);
	assert.throws(
		() => generateFlightPlan(sector, { ...options, minimumFaceDistanceMeters: 0.5 }),
		/at least 1 metre/
	);

	const uphillFacingPlan = generateFlightPlan(sector, {
		...options,
		// The sector centre and north side are high ground; the south side is the
		// air-facing side of the cliff.  The capture path must stay south and look
		// back north towards the sector centre.
		terrainElevationAt: (_longitude, latitude) => (latitude < 47.00015 ? 700 : 720)
	});
	const uphillCaptureWaypoints = uphillFacingPlan.waypoints.filter(
		(waypoint) => waypoint.phase === 'capture'
	);
	assert.ok(uphillCaptureWaypoints.every((waypoint) => waypoint.latitude < 47.00015));
	assert.ok(
		uphillCaptureWaypoints.every((waypoint) => Math.cos((waypoint.heading * Math.PI) / 180) > 0),
		'capture headings should have a northward component towards the sector centre'
	);
	assert.ok(
		uphillFacingPlan.wallDetection.coordinates.length > 2,
		'a continuous steep band should be detected as the wall'
	);
	assert.ok(uphillFacingPlan.wallDetection.confidence > 0.9);
	assert.equal(uphillFacingPlan.wallDetection.shape, 'flat');
	assert.ok(
		uphillFacingPlan.wallDetection.coordinates.every(
			([_longitude, latitude]) => Math.abs(latitude - 47.00015) < 0.00002
		),
		'the detected centreline should follow the terrain break'
	);
});

const sector = {
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

test('rejects terrain between individually clear capture waypoints', () => {
	// This narrow ridge sits between 10 m capture samples, outside their local
	// clearance meshes. Vertex elevations are level and no wall is detected.
	assert.throws(
		() =>
			generateFlightPlan(sector, {
				pointSpacingMeters: 10,
				convergentPasses: 1,
				terrainElevationAt: (longitude) => (Math.abs(longitude - 11.00006) < 0.00001 ? 705 : 700)
			}),
		/Unsafe flight path between waypoints/
	);
});

test('preserves clearance-rejection gaps when selecting continuous row fragments', () => {
	const plan = generateFlightPlan(sector, {
		pointSpacingMeters: 5,
		convergentPasses: 1,
		terrainElevationAt: (longitude, latitude) =>
			latitude >= 47.00015 ? 720 : longitude > 11.00085 && longitude < 11.00115 ? 703 : 700
	});
	assert.ok(plan.metadata.droppedWaypointCount > 0);
	assert.ok(
		plan.metadata.fragmentedRowCount > 0,
		'clearance rejection must split the original sample order'
	);
	assert.ok(plan.metadata.discardedFragmentWaypointCount > 0);
	const firstRow = plan.waypoints.slice(
		0,
		plan.waypoints.findIndex((waypoint) => waypoint.rowBoundary === 'end') + 1
	);
	assert.ok(firstRow.length > 1);
	assert.ok(
		firstRow.every((waypoint) => waypoint.longitude > 11.00115),
		'the fragmented base row must retain only its continuous right-hand section'
	);
	assert.deepEqual(
		plan.waypoints.map((waypoint) => waypoint.index),
		plan.waypoints.map((_, index) => index)
	);
});

test('retains an explicit launch reference without requiring it for preview generation', () => {
	const options = { terrainElevationAt: () => 700 };
	assert.equal(generateFlightPlan(sector, options).metadata.startElevation, undefined);
	assert.equal(
		generateFlightPlan(sector, { ...options, startElevation: 680 }).metadata.startElevation,
		680
	);
	assert.equal(
		generateFlightPlan(sector, { ...options, startElevation: 0 }).metadata.startElevation,
		0
	);
	assert.throws(
		() => generateFlightPlan(sector, { ...options, startElevation: NaN }),
		/Launch elevation/
	);
});

test('rejects a cliff-face intrusion between points even when ground clearance stays sufficient', () => {
	assert.throws(
		() =>
			generateFlightPlan(sector, {
				pointSpacingMeters: 10,
				convergentPasses: 1,
				// The path itself is over level ground. The elevated patch lies beside
				// it, within the face clearance, between the capture samples.
				terrainElevationAt: (longitude, latitude) =>
					Math.abs(longitude - 11.00006) < 0.00001 && Math.abs(latitude - 47.000182) < 0.000006
						? 705
						: 700
			}),
		/Unsafe flight path between waypoints/
	);
});

for (const pattern of ['facade-grid', 'constant-distance-grid']) {
	test(`${pattern} convergent passes aim at the original wall samples`, () => {
		const standOffMeters = 10;
		const plan = generateFlightPlan(sector, {
			pattern,
			standOffMeters,
			pointSpacingMeters: 10,
			convergentPasses: 2,
			convergentOffsetMeters: 2,
			terrainElevationAt: (_longitude, latitude) =>
				700 + Math.max(0, Math.min(1, (latitude - 47.00012) / 0.00006)) * 20
		});
		assert.ok(plan.wallDetection.confidence > 0.9);
		assert.equal(plan.metadata.droppedWaypointCount, 0);
		const rows = [];
		for (const waypoint of plan.waypoints) {
			if (waypoint.rowBoundary === 'start') rows.push([]);
			rows.at(-1).push(waypoint);
		}
		const rowsPerPass = rows.length / 2;
		assert.ok(Number.isInteger(rowsPerPass) && rowsPerPass > 1);
		const latitudeScale = (Math.PI / 180) * 6378137;
		const longitudeScale = latitudeScale * Math.cos((47.00015 * Math.PI) / 180);
		for (let row = 0; row < rowsPerPass; row += 1) {
			const direct = [...rows[row]].sort((a, b) => a.longitude - b.longitude);
			const convergent = [...rows[row + rowsPerPass]].sort((a, b) => a.longitude - b.longitude);
			assert.equal(convergent.length, direct.length);
			// Endpoints may be clamped to the detected wall extent. Interior
			// samples must move 2 m and look back at the same surface location.
			for (let index = 1; index < direct.length - 1; index += 1) {
				const first = direct[index];
				const second = convergent[index];
				const shift = (second.longitude - first.longitude) * longitudeScale;
				assert.ok(Math.abs(shift - 2) < 1e-5);
				assert.ok(
					Math.abs(second.latitude - first.latitude) * latitudeScale < 1e-5,
					'convergence must preserve stand-off on a straight wall'
				);
				const expectedHeading = ((Math.atan2(-shift, standOffMeters) * 180) / Math.PI + 360) % 360;
				assert.ok(
					Math.abs(second.heading - expectedHeading) < 1e-5,
					'the camera must aim back at the direct pass target'
				);
				assert.ok(Math.abs(second.heading - first.heading) > 1);
			}
		}
	});
}

test('orders row transitions by distance in metres at high latitudes', () => {
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
	for (const waypoint of plan.waypoints) {
		if (waypoint.rowBoundary === 'start' || waypoint.rowBoundary === 'single') rows.push([]);
		rows.at(-1).push(waypoint);
		assert.equal('local' in waypoint, false, 'local coordinates must stay internal');
	}
	let distinguishesDegrees = false;
	for (let index = 1; index < rows.length; index += 1) {
		const previous = rows[index - 1].at(-1);
		const first = rows[index][0];
		const last = rows[index].at(-1);
		const distance = (point, metric) =>
			Math.hypot(
				(point.longitude - previous.longitude) * (metric ? longitudeScale : 1),
				(point.latitude - previous.latitude) * (metric ? latitudeScale : 1)
			);
		assert.ok(distance(first, true) <= distance(last, true) + 1e-6);
		if (distance(first, false) > distance(last, false)) distinguishesDegrees = true;
	}
	assert.ok(
		distinguishesDegrees,
		'the fixture must distinguish metre distances from degree distances'
	);
});

test('terrain cache reduces queries and refreshes for each generation', () => {
	let queries = 0;
	let elevation = 700;
	const options = {
		terrainElevationAt: () => {
			queries += 1;
			return elevation;
		}
	};
	const first = generateFlightPlan(sector, options);
	assert.equal(first.waypoints.length, 128);
	assert.ok(queries < 60000, `expected reuse of terrain queries, got ${queries}`);
	elevation = 800;
	queries = 0;
	const second = generateFlightPlan(sector, options);
	assert.ok(queries > 0, 'a new generation must read fresh terrain');
	assert.equal(second.waypoints.length, first.waypoints.length);
	for (let index = 0; index < first.waypoints.length; index += 1) {
		assert.equal(second.waypoints[index].altitude, first.waypoints[index].altitude + 100);
		assert.equal(second.waypoints[index].longitude, first.waypoints[index].longitude);
		assert.equal(second.waypoints[index].latitude, first.waypoints[index].latitude);
	}
});
