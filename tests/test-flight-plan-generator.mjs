import assert from 'node:assert/strict';
import { test } from 'vitest';
import { generateFlightPlan } from '../src/lib/assets/js/flight-plan-generator.js';

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
	assert.equal(plan.waypoints[0].action, 'startInterval');
	assert.ok(plan.waypoints.every((waypoint) => waypoint.altitude >= 703));
	assert.ok(plan.waypoints.some((waypoint) => waypoint.action === 'startInterval'));
	assert.ok(plan.waypoints.some((waypoint) => waypoint.action === 'stopInterval'));
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

	const fragmentedTerrainPlan = generateFlightPlan(sector, {
		...options,
		terrainElevationAt: (longitude) => (longitude > 11.0008 && longitude < 11.0012 ? 720 : 700)
	});
	assert.ok(
		fragmentedTerrainPlan.metadata.fragmentedRowCount > 0,
		'a capped row split by high terrain should be replanned as separate fragments'
	);
	assert.ok(
		fragmentedTerrainPlan.metadata.discardedFragmentWaypointCount > 0,
		'the shorter disconnected fragment should not be bridged by the capture path'
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
