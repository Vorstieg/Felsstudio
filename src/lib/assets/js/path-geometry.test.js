import { describe, expect, it } from 'vitest';
import {
	closePath,
	getEditablePath,
	getPathMidpoints,
	insertPathVertex,
	movePathVertex,
	removePathVertex,
	translatePath
} from './path-geometry.ts';

describe('path geometry', () => {
	it('closing a path is idempotent, including single-vertex drafts', () => {
		for (const path of [
			[],
			[[1, 2]],
			[
				[1, 2],
				[3, 4]
			]
		]) {
			const closed = closePath(path);
			expect(closePath(closed)).toEqual(closed);
		}
	});

	it('updates the closing point when inserting or removing the first vertex', () => {
		const ring = [
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2],
			[0, 0]
		];
		expect(insertPathVertex(ring, 0, [-1, 0])).toEqual([
			[-1, 0],
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2],
			[-1, 0]
		]);
		for (const index of [0, ring.length - 1]) {
			expect(removePathVertex(ring, index)).toEqual([
				[2, 0],
				[2, 2],
				[0, 2],
				[2, 0]
			]);
		}
		expect(insertPathVertex([], 0, [1, 2], { closed: true })).toEqual([
			[1, 2],
			[1, 2]
		]);
		expect(
			removePathVertex(
				[
					[1, 2],
					[1, 2]
				],
				0,
				{ closed: true, minPoints: 0 }
			)
		).toEqual([]);
	});

	it('respects explicitly open paths even when their endpoints coincide', () => {
		const path = [
			[0, 0],
			[2, 0],
			[0, 0]
		];
		expect(movePathVertex(path, 0, [1, 1], { closed: false })).toEqual([
			[1, 1],
			[2, 0],
			[0, 0]
		]);
		expect(getEditablePath(path, { closed: false })).toEqual(path);
	});

	it('handles empty drafts without inventing vertices or edges', () => {
		expect(closePath([])).toEqual([]);
		expect(movePathVertex([], 0, [1, 2], { closed: true })).toEqual([]);
		expect(removePathVertex([], 0, { closed: true })).toEqual([]);
		expect(translatePath([], [1, 2], { closed: true })).toEqual([]);
		expect(getPathMidpoints([], { closed: true })).toEqual([]);
		expect(insertPathVertex([], 0, [1, 2])).toEqual([[1, 2]]);
	});

	it('reuses unchanged points without mutating the input', () => {
		const path = [
			[0, 0],
			[2, 0],
			[2, 2]
		];
		const moved = movePathVertex(path, 1, [1, 1]);
		expect(moved).not.toBe(path);
		expect(moved[0]).toBe(path[0]);
		expect(moved[2]).toBe(path[2]);
		expect(path).toEqual([
			[0, 0],
			[2, 0],
			[2, 2]
		]);
	});

	it('edits the last vertex of an unclosed polygon without treating it as the first', () => {
		const path = [
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 2]
		];
		expect(movePathVertex(path, 3, [1, 2], { closed: true })).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[1, 2],
			[0, 0]
		]);
		expect(removePathVertex(path, 3, { closed: true })).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[0, 0]
		]);
		expect(getPathMidpoints(path, { closed: true })).toEqual([
			{ index: 0, insertIndex: 1, point: [1, 0] },
			{ index: 1, insertIndex: 2, point: [2, 1] },
			{ index: 2, insertIndex: 3, point: [1, 2] },
			{ index: 3, insertIndex: 4, point: [0, 1] }
		]);
	});

	it('ignores invalid move and removal indices and clamps insertion indices', () => {
		const path = [
			[0, 0],
			[2, 0],
			[2, 2]
		];
		for (const index of [-1, 3]) {
			expect(movePathVertex(path, index, [1, 1])).toEqual(path);
			expect(removePathVertex(path, index)).toEqual(path);
		}
		expect(insertPathVertex(path, -1, [1, 1])).toEqual([[1, 1], ...path]);
		expect(insertPathVertex(path, 10, [1, 1])).toEqual([...path, [1, 1]]);
	});

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
