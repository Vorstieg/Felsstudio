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

	it('exposes every selected multi-pitch path handle when the canvas is idle', () => {
		const idle = renderModel({ activeTool: 'routeEdit' });
		const interacting = renderModel({ activeTool: 'routeEdit', isInteractionActive: true });

		expect(idle.routePointHandles).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ routeId: 'route-multi', pitchId: 'pitch-1', index: 0 }),
				expect.objectContaining({ routeId: 'route-multi', pitchId: 'pitch-1', index: 1 }),
				expect.objectContaining({ routeId: 'route-multi', variantId: 'variant-1', index: 0 }),
				expect.objectContaining({ routeId: 'route-multi', variantId: 'variant-1', index: 1 })
			])
		);
		expect(interacting.routePointHandles).toEqual([]);
		expect(idle.routeMidpoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ routeId: 'route-multi', pitchId: 'pitch-1' }),
				expect.objectContaining({ routeId: 'route-multi', variantId: 'variant-1' })
			])
		);
		expect(interacting.routeMidpoints).toEqual([]);
		expect(idle.outlines.handles.length).toBeGreaterThan(0);
		expect(interacting.outlines.handles).toEqual([]);
	});

	it('does not duplicate handles for the active multi-pitch path', () => {
		const model = renderModel({
			activeTool: 'routeEdit',
			drawingTarget: { type: 'pitch', routeId: 'route-multi', pitchId: 'pitch-1' }
		});

		expect(model.routePointHandles).toHaveLength(2);
		expect(model.routePointHandles).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ routeId: 'route-multi', pitchId: 'pitch-1', index: 0 }),
				expect.objectContaining({ routeId: 'route-multi', pitchId: 'pitch-1', index: 1 })
			])
		);
		expect(model.routeMidpoints).toHaveLength(1);
	});

	it('keeps single-pitch route handles scoped to the selected route', () => {
		const model = renderModel({
			ui: { selectedRouteId: 'route-1' },
			isSelected: (type, id) => type === 'route' && id === 'route-1'
		});

		expect(model.routePointHandles).toHaveLength(3);
		expect(model.routePointHandles).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ routeId: 'route-1', pitchId: null, variantId: null })
			])
		);
		expect(model.routeMidpoints).toHaveLength(2);
	});

	it('renders selected route controls even when a nested path is also selected', () => {
		const model = renderModel({
			selectionSize: 2,
			isSelected: (type, id) => type === 'route' && id === 'route-1'
		});

		expect(model.routePointHandles).toHaveLength(3);
		expect(model.routeMidpoints).toHaveLength(2);
	});

	it('renders controls for the active single-pitch route target', () => {
		const model = renderModel({
			ui: { selectedRouteId: null },
			selectionSize: 0,
			isSelected: () => false,
			activeTool: 'routeEdit',
			drawingTarget: { type: 'route', id: 'route-1' }
		});

		expect(model.routePointHandles).toHaveLength(3);
		expect(model.routeMidpoints).toHaveLength(2);
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
