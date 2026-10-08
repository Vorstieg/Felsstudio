import { describe, expect, it } from 'vitest';
import { getGeometryPath, editGeometryPath } from './geometry-path-adapters.ts';
import {
	insertPathVertex,
	movePathVertex,
	removePathVertex,
	translatePath
} from './path-geometry.ts';

describe('geometry path adapters', () => {
	it('extracts only 2D coordinates and handles geometries without a path', () => {
		expect(
			getGeometryPath({
				type: 'LineString',
				coordinates: [
					[0, 1, 2],
					[3, 4, 5]
				]
			})
		).toEqual([
			[0, 1],
			[3, 4]
		]);
		for (const geometry of [null, undefined, { type: 'Point', coordinates: [1, 2] }]) {
			expect(getGeometryPath(geometry)).toEqual([]);
			expect(
				editGeometryPath(geometry, (path, closed) => movePathVertex(path, 0, [3, 4], { closed }))
			).toBe(geometry);
		}
	});

	it('leaves incomplete paths unchanged', () => {
		for (const coordinates of [[], [[1, 2]]]) {
			const geometry = { type: 'LineString', coordinates };
			expect(
				editGeometryPath(geometry, (path, closed) => movePathVertex(path, 0, [3, 4], { closed }))
			).toBe(geometry);
			expect(
				editGeometryPath(geometry, (path, closed) => insertPathVertex(path, 0, [3, 4], { closed }))
			).toBe(geometry);
			expect(
				editGeometryPath(geometry, (path, closed) => removePathVertex(path, 0, { closed }))
			).toBe(geometry);
			expect(
				editGeometryPath(geometry, (path, closed) => translatePath(path, [3, 4], { closed }))
			).toBe(geometry);
		}
	});

	it('edits LineStrings without mutating the original geometry', () => {
		const geometry = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[2, 0]
			]
		};
		const moved = editGeometryPath(geometry, (path, closed) =>
			movePathVertex(path, 0, [1, 1], { closed })
		);
		const inserted = editGeometryPath(geometry, (path, closed) =>
			insertPathVertex(path, 1, [1, 0], { closed })
		);

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
					[0.5, 0.5, 10],
					[1, 0.5, 11],
					[1, 1, 12],
					[0.5, 0.5, 10]
				]
			]
		};
		const moved = editGeometryPath(geometry, (path, closed) =>
			movePathVertex(path, 0, [1, 1], { closed })
		);
		const translated = editGeometryPath(geometry, (path, closed) =>
			translatePath(path, [1, -1], { closed })
		);

		expect(moved.coordinates[0]).toEqual([
			[1, 1],
			[2, 0],
			[2, 2],
			[1, 1]
		]);
		expect(moved.coordinates[1]).toEqual(geometry.coordinates[1]);
		expect(moved.coordinates[1]).toBe(geometry.coordinates[1]);
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
					[0, 1],
					[0, 0]
				]
			]
		};
		expect(
			editGeometryPath(geometry, (path, closed) => removePathVertex(path, 0, { closed }))
		).toEqual(geometry);
	});
});
