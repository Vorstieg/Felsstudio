import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	pointToTriangleDistance,
	terrainSurfaceClearance
} from '../src/lib/assets/js/flight-plan-terrain.ts';

test('triangle distance handles the face interior and every edge and vertex', () => {
	const a = [0, 0, 0],
		b = [1, 0, 0],
		c = [0, 1, 0];
	const cases = [
		[[0.2, 0.2, 1], 1], // Previously overestimated as 1.0862780491.
		[[0.5, -1, 0], 1],
		[[-1, 0.5, 0], 1],
		[[1, 1, 0], Math.SQRT1_2],
		[[-1, -1, 0], Math.SQRT2],
		[[2, 0, 0], 1],
		[[0, 2, 0], 1]
	];
	for (const vertices of [
		[a, b, c],
		[a, c, b],
		[b, c, a],
		[c, a, b]
	]) {
		for (const [point, expected] of cases) {
			assert.ok(Math.abs(pointToTriangleDistance(point, ...vertices) - expected) < 1e-12);
		}
	}
});

test('terrain clearance matches the analytic distance to sloped planes', () => {
	for (const [slopeX, slopeY] of [
		[0, 0],
		[1, 1],
		[-0.5, 2],
		[3, -1]
	]) {
		const local = [0.23, -0.37];
		const terrainAt = ([x, y]) => 700 + slopeX * x + slopeY * y;
		const altitude = terrainAt(local) + 2;
		const expected = 2 / Math.hypot(1, slopeX, slopeY);
		assert.ok(
			Math.abs(terrainSurfaceClearance(local, altitude, terrainAt, 2, 1) - expected) < 1e-10
		);
	}
});

test('terrain clearance detects narrow hazards between fixed grid points', () => {
	const terrainAt = ([x, y]) => (Math.abs(x - 0.2) < 0.05 && Math.abs(y - 0.2) < 0.05 ? 5 : 0);
	assert.ok(terrainSurfaceClearance([0.2, 0.2], 3, terrainAt, 2, 1) < 2);
});
