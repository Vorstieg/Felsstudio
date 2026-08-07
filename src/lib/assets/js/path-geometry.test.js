import { describe, expect, it } from 'vitest';
import {
	closePath,
	getEditablePath,
	getPathMidpoints,
	insertPathVertex,
	movePathVertex,
	removePathVertex,
	translatePath
} from './path-geometry.js';

describe('path geometry', () => {
	it('maintains a closed ring while editing its first or closing vertex', () => {
		const ring = [
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 0]
		];
		expect(getEditablePath(ring)).toEqual([
			[0, 0],
			[2, 0],
			[2, 2]
		]);
		expect(movePathVertex(ring, 3, [1, 1])).toEqual([
			[1, 1],
			[2, 0],
			[2, 2],
			[1, 1]
		]);
		expect(
			closePath([
				[0, 0],
				[1, 0]
			])
		).toEqual([
			[0, 0],
			[1, 0],
			[0, 0]
		]);
	});

	it('inserts and removes vertices without breaking ring closure or minimum size', () => {
		const ring = [
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 0]
		];
		const inserted = insertPathVertex(ring, 1, [1, 0]);
		expect(inserted).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
			[2, 2],
			[0, 0]
		]);
		expect(removePathVertex(inserted, 1)).toEqual(ring);
		expect(removePathVertex(ring, 0)).toEqual(ring);
	});

	it('translates open and closed paths and returns edge midpoints', () => {
		expect(
			translatePath(
				[
					[1, 2],
					[3, 4]
				],
				[2, -1]
			)
		).toEqual([
			[3, 1],
			[5, 3]
		]);
		expect(
			getPathMidpoints([
				[0, 0],
				[2, 0],
				[2, 2]
			])
		).toEqual([
			{ index: 0, insertIndex: 1, point: [1, 0] },
			{ index: 1, insertIndex: 2, point: [2, 1] }
		]);
	});
});
