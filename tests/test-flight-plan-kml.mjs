// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import JSZip from 'jszip';
import { generateFlightPlan } from '../src/lib/assets/js/flight-plan-generator.ts';
import {
	createFlightPlanKmz,
	exportFlightPlanKml,
	exportFlightPlanTemplateKml,
	exportFlightPlanWaylinesWpml,
	flightPlanKmlFilename,
	flightPlanKmzFilename
} from '../src/lib/assets/js/flight-plan-kml.ts';

test('exports valid KML and KMZ flight plans', async () => {
	const plan = {
		name: 'Rote Wand / Capture',
		cragName: 'Rote Wand',
		metadata: {
			pattern: 'half-helix',
			targetGsdCm: 0.3,
			standOffMeters: 1,
			startElevation: 800
		},
		waypoints: [
			{
				longitude: 15.123456789,
				latitude: 47.123456789,
				altitude: 822.5,
				phase: 'transit',
				speed: 6,
				rowBoundary: null
			},
			{
				longitude: 15.123556789,
				latitude: 47.123556789,
				altitude: 828,
				phase: 'capture',
				speed: 2,
				heading: 270,
				gimbalPitch: -12,
				camera: 'tele-6x',
				rowBoundary: 'start'
			}
		]
	};

	const templateKml = exportFlightPlanTemplateKml(plan);
	const waylinesWpml = exportFlightPlanWaylinesWpml(plan);
	const kml = exportFlightPlanKml(plan);

	for (const xml of [templateKml, waylinesWpml]) {
		assert.match(xml, /xmlns:wpml="http:\/\/www\.uav\.com\/wpmz\/1\.0\.2"/);
		assert.match(xml, /<wpml:droneEnumValue>68<\/wpml:droneEnumValue>/);
		assert.match(xml, /<wpml:droneSubEnumValue>0<\/wpml:droneSubEnumValue>/);
	}
	assert.match(
		waylinesWpml,
		/<wpml:executeHeightMode>relativeToStartPoint<\/wpml:executeHeightMode>/
	);
	assert.match(waylinesWpml, /15\.12345679,47\.12345679/);
	assert.match(waylinesWpml, /<wpml:executeHeight>22\.5<\/wpml:executeHeight>/);
	assert.match(waylinesWpml, /<wpml:waypointHeadingAngle>-90<\/wpml:waypointHeadingAngle>/);
	assert.match(waylinesWpml, /<wpml:actionGroup>/);
	assert.match(waylinesWpml, /<wpml:actionActuatorFunc>gimbalRotate<\/wpml:actionActuatorFunc>/);
	assert.match(waylinesWpml, /<wpml:actionActuatorFunc>zoom<\/wpml:actionActuatorFunc>/);
	assert.match(waylinesWpml, /<wpml:focalLength>168<\/wpml:focalLength>/);
	assert.match(waylinesWpml, /<wpml:actionActuatorFunc>takePhoto<\/wpml:actionActuatorFunc>/);
	assert.equal(kml, waylinesWpml);
	assert.equal(flightPlanKmlFilename({ name: 'Rote Wand / Capture' }), 'rote-wand-capture.kml');
	assert.equal(flightPlanKmzFilename({ name: 'Rote Wand / Capture' }), 'rote-wand-capture.kmz');
	assert.throws(
		() => exportFlightPlanKml({ waypoints: [{ longitude: 15, latitude: 47, altitude: 800 }] }),
		/at least two waypoints/
	);
	assert.match(
		exportFlightPlanKml({
			metadata: { startElevation: 700 },
			waypoints: [
				{ longitude: 15, latitude: 47, altitude: 800, heading: -270 },
				{ longitude: 15.001, latitude: 47.001, altitude: 800, heading: 540 }
			]
		}),
		/<wpml:waypointHeadingAngle>90<\/wpml:waypointHeadingAngle>[\s\S]*<wpml:waypointHeadingAngle>-180<\/wpml:waypointHeadingAngle>/
	);

	const kmz = await createFlightPlanKmz(plan);
	const extracted = await JSZip.loadAsync(await kmz.arrayBuffer());
	assert.deepEqual(
		extracted
			.filter(() => true)
			.map((entry) => entry.name)
			.sort(),
		['res/', 'template.kml', 'waylines.wpml']
	);
	const archivedTemplate = await extracted.file('template.kml').async('string');
	assert.match(archivedTemplate, /<wpml:author>Felsstudio<\/wpml:author>/);
	assert.match(archivedTemplate, /<wpml:createTime>\d+<\/wpml:createTime>/);
	assert.match(archivedTemplate, /<wpml:droneEnumValue>68<\/wpml:droneEnumValue>/);
	assert.equal(await extracted.file('waylines.wpml').async('string'), waylinesWpml);
});

test('requires an explicit finite launch elevation and exports straight stopped segments', () => {
	const plan = {
		metadata: { standOffMeters: 2 },
		waypoints: [
			{ longitude: 15, latitude: 47, altitude: 703, relativeAltitude: 99 },
			{ longitude: 15.001, latitude: 47, altitude: 713, executeHeight: 99 }
		]
	};
	for (const startElevation of [undefined, null, '', NaN, Infinity]) {
		plan.metadata.startElevation = startElevation;
		assert.throws(() => exportFlightPlanWaylinesWpml(plan), /launch elevation/);
		assert.throws(() => exportFlightPlanTemplateKml(plan), /launch elevation/);
	}
	plan.metadata.startElevation = 680;
	const xml = exportFlightPlanWaylinesWpml(plan);
	assert.match(xml, /<wpml:executeHeight>23<\/wpml:executeHeight>/);
	assert.match(xml, /<wpml:executeHeight>33<\/wpml:executeHeight>/);
	assert.equal((xml.match(/toPointAndStopWithDiscontinuityCurvature/g) || []).length, 2);
	assert.equal((xml.match(/<wpml:useStraightLine>1/g) || []).length, 2);
	plan.metadata.startElevation = 0;
	assert.match(exportFlightPlanWaylinesWpml(plan), /<wpml:executeHeight>703<\/wpml:executeHeight>/);
});

test('exports overview and detail photos with the generated camera pitches', () => {
	const plan = generateFlightPlan(
		{
			type: 'Polygon',
			coordinates: [
				[
					[11, 47],
					[11.0004, 47],
					[11.0004, 47.0001],
					[11, 47.0001],
					[11, 47]
				]
			]
		},
		{
			startElevation: 680,
			terrainElevationAt: (_longitude, latitude) =>
				700 + Math.max(0, Math.min(1, (latitude - 47.00002) / 0.00006)) * 20
		}
	);
	assert.equal(plan.metadata.camera, 'wide');
	assert.equal(
		plan.metadata.photoCount,
		plan.waypoints.filter((waypoint) => waypoint.phase === 'capture').length +
			plan.metadata.detailPhotoCount
	);
	assert.ok(plan.metadata.detailPhotoCount > 0);
	assert.equal(plan.previewWaypointIndex, plan.waypoints[0].index);
	const xml = exportFlightPlanWaylinesWpml(plan);
	assert.equal(
		(xml.match(/<wpml:actionActuatorFunc>takePhoto</g) || []).length,
		plan.metadata.photoCount
	);
	assert.equal((xml.match(/<wpml:focalLength>28</g) || []).length, plan.waypoints.length);
	assert.equal((xml.match(/<wpml:focalLength>168</g) || []).length, plan.metadata.detailPhotoCount);
	assert.ok(plan.waypoints.some((waypoint) => waypoint.gimbalPitch !== -8));
});

test('normalizes export numbers and defaults consistently across waypoint actions and mission files', async () => {
	const plan = {
		metadata: { startElevation: 700 },
		waypoints: [
			{
				longitude: '11',
				latitude: '47',
				altitude: '703',
				phase: 'capture',
				heading: '450',
				speed: '3',
				gimbalPitch: '-12',
				camera: '6x'
			},
			{
				longitude: 11.001,
				latitude: 47,
				altitude: 713,
				phase: 'capture',
				heading: NaN,
				speed: Infinity,
				gimbalPitch: NaN
			}
		]
	};
	const xml = exportFlightPlanWaylinesWpml(plan);
	const placemarks = [...xml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map(
		(match) => match[1]
	);
	assert.match(placemarks[0], /<wpml:waypointHeadingAngle>90</);
	assert.match(placemarks[0], /<wpml:waypointSpeed>3</);
	assert.match(placemarks[0], /<wpml:focalLength>168</);
	assert.match(placemarks[1], /<wpml:waypointHeadingAngle>0</);
	assert.match(placemarks[1], /<wpml:waypointSpeed>2.5</);
	assert.match(placemarks[1], /<wpml:focalLength>28</);
	for (const [index, pitch] of [
		[0, -12],
		[1, -8]
	]) {
		assert.ok(
			placemarks[index].includes(
				`<wpml:gimbalPitchRotateAngle>${pitch}</wpml:gimbalPitchRotateAngle>`
			)
		);
		assert.ok(
			placemarks[index].includes(
				`<wpml:waypointGimbalPitchAngle>${pitch}</wpml:waypointGimbalPitchAngle>`
			)
		);
	}
	const archive = await JSZip.loadAsync(await (await createFlightPlanKmz(plan)).arrayBuffer());
	assert.equal(await archive.file('waylines.wpml').async('string'), xml);
	const template = await archive.file('template.kml').async('string');
	assert.match(template, /<wpml:globalTransitionalSpeed>3</);
});
