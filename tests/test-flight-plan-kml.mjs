// @vitest-environment node

import assert from 'node:assert/strict';
import { test } from 'vitest';
import JSZip from 'jszip';
import {
	createFlightPlanKmz,
	exportFlightPlanKml,
	exportFlightPlanTemplateKml,
	exportFlightPlanWaylinesWpml,
	flightPlanKmlFilename,
	flightPlanKmzFilename
} from '../src/lib/assets/js/flight-plan-kml.js';

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
				action: 'none'
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
				action: 'startInterval',
				photoInterval: 2,
				triggerDistance: 1.5
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
