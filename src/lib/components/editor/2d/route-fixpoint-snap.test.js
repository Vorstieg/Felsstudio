// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { referenceFixpoint, snapRoutePointToFixpoint } from './route-fixpoint-snap.js';

describe('route fixpoint snapping', () => {
	const fixPoints = [
		{ id: 'near', position2D: [0.5, 0.5] },
		{ id: 'far', position2D: [0.8, 0.8] }
	];

	it('snaps to the closest fixpoint in the pixel threshold', () => {
		expect(
			snapRoutePointToFixpoint({ x: 0.506, y: 0.5 }, fixPoints, {
				enabled: true,
				thresholdPx: 18,
				canvasSize: { baseWidth: 1000, baseHeight: 667 }
			})
		).toEqual({ point: { x: 0.5, y: 0.5 }, fixPointId: 'near' });
	});

	it('does not snap when disabled or outside the threshold', () => {
		const point = { x: 0.55, y: 0.5 };
		expect(snapRoutePointToFixpoint(point, fixPoints)).toEqual({ point, fixPointId: null });
		expect(
			snapRoutePointToFixpoint(point, fixPoints, {
				enabled: true,
				thresholdPx: 2,
				canvasSize: { baseWidth: 1000, baseHeight: 667 }
			})
		).toEqual({ point, fixPointId: null });
	});

	it('references a fixpoint only once', () => {
		const route = {};
		referenceFixpoint(route, 'near');
		referenceFixpoint(route, 'near');
		expect(route.fixPoints).toEqual(['near']);
	});
});
