import { describe, expect, it } from 'vitest';
import { translateGeometryTo } from './sector-utils.js';

describe('translateGeometryTo', () => {
	it('moves every polygon ring by the same delta without changing its shape', () => {
		const geometry = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[4, 0],
					[4, 4],
					[0, 4],
					[0, 0]
				],
				[
					[1, 1],
					[2, 1],
					[2, 2],
					[1, 1]
				]
			]
		};

		const translated = translateGeometryTo(geometry, [12, 22]);

		expect(translated.coordinates[0]).toEqual([
			[10, 20],
			[14, 20],
			[14, 24],
			[10, 24],
			[10, 20]
		]);
		expect(translated.coordinates[1]).toEqual([
			[11, 21],
			[12, 21],
			[12, 22],
			[11, 21]
		]);
		expect(geometry.coordinates[1][0]).toEqual([1, 1]);
	});
});
