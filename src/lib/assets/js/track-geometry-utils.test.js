// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { cleanStationaryTrackCoordinates, trimCoordinatesEnd } from './track-geometry-utils.js';

describe('trimCoordinatesEnd', () => {
	it('removes the requested number of points from the end', () => {
		const coordinates = [
			[0, 0],
			[1, 1],
			[2, 2],
			[3, 3],
			[4, 4]
		];

		expect(trimCoordinatesEnd(coordinates, 2)).toEqual([
			[0, 0],
			[1, 1],
			[2, 2]
		]);
	});
});

describe('cleanStationaryTrackCoordinates', () => {
	it('collapses a long GPS-drift cluster while preserving its endpoints', () => {
		const coordinates = [
			[11, 47],
			[11.00001, 47.00001],
			[10.99999, 47.00002],
			[11.00002, 46.99999],
			[10.99998, 47],
			[11.00001, 46.99998],
			[11.00002, 47.00001],
			[11.00003, 46.99999],
			[11.00001, 47.00002],
			[11.0003, 47.0003]
		];

		expect(
			cleanStationaryTrackCoordinates(coordinates, { radiusMeters: 15, minimumPoints: 5 })
		).toEqual([coordinates[0], coordinates[8], coordinates[9]]);
	});

	it('leaves a short, nearby section untouched', () => {
		const coordinates = [
			[11, 47],
			[11.00001, 47.00001],
			[11.00002, 47.00002],
			[11.0002, 47.0002]
		];

		expect(
			cleanStationaryTrackCoordinates(coordinates, { radiusMeters: 15, minimumPoints: 5 })
		).toEqual(coordinates);
	});
});
