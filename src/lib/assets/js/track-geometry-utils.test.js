// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { trimCoordinatesEnd } from './track-geometry-utils.js';

describe('trimCoordinatesEnd', () => {
	it('removes the requested number of points from the end', () => {
		const coordinates = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];

		expect(trimCoordinatesEnd(coordinates, 2)).toEqual([[0, 0], [1, 1], [2, 2]]);
	});
});
