// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { referenceFixpoint, snapRoutePointToAnchor } from './route-fixpoint-snap.js';

describe('route anchor snapping', () => {
	const anchors = [
		{ id: 'bolt', type: 'bolt', position2D: [0.5, 0.5] },
		{ id: 'belay', type: 'belay', position2D: [0.505, 0.5] },
		{ id: 'abseil', type: 'abseil', position2D: [0.8, 0.8] }
	];

	it('snaps to the closest belay anchor in the pixel threshold', () => {
		expect(
			snapRoutePointToAnchor({ x: 0.506, y: 0.5 }, anchors, {
				enabled: true,
				thresholdPx: 18,
				canvasSize: { baseWidth: 1000, baseHeight: 667 }
			})
		).toEqual({ point: { x: 0.505, y: 0.5 }, anchorId: 'belay' });
	});

	it('snaps to abseil anchors but ignores bolts', () => {
		expect(
			snapRoutePointToAnchor({ x: 0.8, y: 0.8 }, anchors, {
				enabled: true,
				canvasSize: { baseWidth: 1000, baseHeight: 667 }
			})
		).toEqual({ point: { x: 0.8, y: 0.8 }, anchorId: 'abseil' });
		expect(
			snapRoutePointToAnchor(
				{ x: 0.5, y: 0.5 },
				[{ id: 'bolt', type: 'bolt', position2D: [0.5, 0.5] }],
				{
					enabled: true,
					canvasSize: { baseWidth: 1000, baseHeight: 667 }
				}
			)
		).toEqual({ point: { x: 0.5, y: 0.5 }, anchorId: null });
	});

	it('does not snap when disabled or outside the threshold', () => {
		const point = { x: 0.55, y: 0.5 };
		expect(snapRoutePointToAnchor(point, anchors)).toEqual({ point, anchorId: null });
		expect(
			snapRoutePointToAnchor(point, anchors, {
				enabled: true,
				thresholdPx: 2,
				canvasSize: { baseWidth: 1000, baseHeight: 667 }
			})
		).toEqual({ point, anchorId: null });
	});

	it('references a fixpoint only once', () => {
		const route = {};
		referenceFixpoint(route, 'near');
		referenceFixpoint(route, 'near');
		expect(route.fixPoints).toEqual(['near']);
	});
});
