import { describe, expect, it } from 'vitest';
import { buildTopo2DRenderModel } from './topo-2d-render-model.js';
import fixture from '../../../../../tests/fixtures/2d/mixed-topo.json';

function renderModel(overrides = {}) {
	const topo = structuredClone(fixture);
	const selected = new Set(['route:route-multi', 'outline:outline-polyline']);
	return buildTopo2DRenderModel({
		topo,
		ui: { selectedRouteId: 'route-multi' },
		isSelected: (type, id) => selected.has(`${type}:${id}`),
		selectionSize: 1,
		activeTool: 'select',
		drawingTarget: null,
		isInteractionActive: false,
		baseWidth: 1000,
		baseHeight: 667,
		currentRoutePoints: [],
		currentOutlinePoints: [],
		...overrides
	});
}

describe('buildTopo2DRenderModel', () => {
	it('flattens nested pitches and variants into renderable lines', () => {
		const model = renderModel();

		expect(model.routes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ pitchId: 'pitch-1', isPitch: true }),
				expect.objectContaining({ variantId: 'variant-1', isVariant: true })
			])
		);
		expect(model.routeLabels.length).toBeGreaterThanOrEqual(3);
	});

	it('only exposes selected edit handles when the canvas is idle', () => {
		const idle = renderModel({ activeTool: 'routeEdit' });
		const interacting = renderModel({ activeTool: 'routeEdit', isInteractionActive: true });

		expect(idle.routePointHandles.length).toBe(0);
		expect(idle.outlines.handles.length).toBeGreaterThan(0);
		expect(interacting.outlines.handles).toEqual([]);
	});

	it('emits current drawing previews without changing persisted routes', () => {
		const model = renderModel({
			currentRoutePoints: [
				[0.1, 0.9],
				[0.2, 0.7]
			],
			currentOutlinePoints: [
				[0.1, 0.1],
				[0.2, 0.1],
				[0.2, 0.2]
			]
		});

		expect(model.currentRoute[0].pointsStr).toBe('100,600.3000000000001 200,466.9');
		expect(model.currentOutlineFill).toHaveLength(1);
	});
});
