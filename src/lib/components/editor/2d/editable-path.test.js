// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createEditablePathResolver } from './editable-path.js';
import fixture from '../../../../../tests/fixtures/2d/mixed-topo.json';

function createResolver() {
	const topo = structuredClone(fixture);
	return {
		topo,
		resolver: createEditablePathResolver({
			topo,
			viewport: { baseWidth: 1000, baseHeight: 667 }
		})
	};
}

describe('createEditablePathResolver', () => {
	it('resolves nested pitch and variant paths independently', () => {
		const { topo, resolver } = createResolver();
		const pitch = resolver.resolve({ routeId: 'route-multi', pitchId: 'pitch-1' });
		const variant = resolver.resolve({ routeId: 'route-multi', variantId: 'variant-1' });

		pitch.movePoint(1, [0.51, 0.57]);
		variant.insertPoint(1, [0.4, 0.7]);

		expect(topo.routes[1].pitches[0].points2D).toEqual([
			[0.42, 0.82],
			[0.51, 0.57]
		]);
		expect(topo.routes[1].variants[0].points2D).toEqual([
			[0.42, 0.82],
			[0.4, 0.7],
			[0.37, 0.6]
		]);
	});

	it('detaches a preset before changing a vertex', () => {
		const { topo, resolver } = createResolver();
		const path = resolver.resolve({ outlineId: 'outline-preset' });
		const before = path.getPoints();

		path.movePoint(0, [0.6, 0.3]);

		const outline = topo.outlines.find((item) => item.id === 'outline-preset');
		expect(outline.shape.type).toBe('polyline');
		expect(outline.preset).toBeUndefined();
		expect(outline.points2D[0]).toEqual([0.6, 0.3]);
		expect(outline.points2D).toHaveLength(before.length);
	});

	it('translates from an immutable snapshot', () => {
		const { topo, resolver } = createResolver();
		const path = resolver.resolve({ routeId: 'route-1' });
		const snapshot = path.snapshot();

		path.translateFrom(snapshot, [0.1, -0.2]);

		expect(snapshot).toEqual([
			[0.12, 0.88],
			[0.22, 0.64],
			[0.31, 0.42]
		]);
		expect(topo.routes[0].points2D).toEqual([
			[0.22, 0.6799999999999999],
			[0.32, 0.44],
			[0.41000000000000003, 0.21999999999999997]
		]);
	});
});
