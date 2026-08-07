import { describe, expect, it } from 'vitest';
import {
	insertGeometryVertex,
	moveGeometryVertex,
	removeGeometryVertex,
	translateGeometryPath
} from './geometry-path-adapters.js';

describe('geometry path adapters', () => {
	it('edits LineStrings without mutating the original geometry', () => {
		const geometry = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[2, 0]
			]
		};
		const moved = moveGeometryVertex(geometry, 0, [1, 1]);
		const inserted = insertGeometryVertex(geometry, 1, [1, 0]);

		expect(moved.coordinates).toEqual([
			[1, 1],
			[2, 0]
		]);
		expect(inserted.coordinates).toEqual([
			[0, 0],
			[1, 0],
			[2, 0]
		]);
		expect(geometry.coordinates).toEqual([
			[0, 0],
			[2, 0]
		]);
	});

	it('keeps polygon rings closed and preserves non-edited rings', () => {
		const geometry = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[2, 0],
					[2, 2],
					[0, 0]
				],
				[
					[0.5, 0.5],
					[1, 0.5],
					[0.5, 0.5]
				]
			]
		};
		const moved = moveGeometryVertex(geometry, 0, [1, 1]);
		const translated = translateGeometryPath(geometry, [1, -1]);

		expect(moved.coordinates[0]).toEqual([
			[1, 1],
			[2, 0],
			[2, 2],
			[1, 1]
		]);
		expect(moved.coordinates[1]).toEqual(geometry.coordinates[1]);
		expect(translated.coordinates[0][0]).toEqual([1, -1]);
		expect(translated.coordinates[0].at(-1)).toEqual([1, -1]);
	});

	it('refuses to remove polygon vertices below the minimum ring size', () => {
		const geometry = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[0, 0]
				]
			]
		};
		expect(removeGeometryVertex(geometry, 0)).toEqual(geometry);
	});
});
