// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { RouteTool } from './RouteTool.svelte.js';

function createTool() {
	const state = {
		topo: { routes: [], fixPoints: [] },
		ui: { selectedRouteId: null, selectedFixpointId: null }
	};
	let target = null;
	const setDrawingTarget = vi.fn((value) => (target = value));
	const tool = new RouteTool({
		state,
		getDrawingTarget: () => target,
		setDrawingTarget,
		saveHistory: vi.fn(),
		snapPoint: (point) => ({ point, fixPointId: point.fixPointId || null }),
		referenceFixpoint: vi.fn()
	});
	return { state, tool, target: () => target, setDrawingTarget };
}

describe('RouteTool', () => {
	it('builds a sports route from a two-point draft and selects it', () => {
		const { state, tool } = createTool();

		tool.appendPoint('route', { x: 0.1, y: 0.2 });
		tool.appendPoint('route', { x: 0.8, y: 0.9 });
		tool.finish('route');

		expect(state.topo.routes).toHaveLength(1);
		expect(state.topo.routes[0]).toMatchObject({
			type: 'sports-climbing',
			grade: '5a',
			points2D: [
				[0.1, 0.2],
				[0.8, 0.9]
			]
		});
		expect(state.ui.selectedRouteId).toBe(state.topo.routes[0].id);
		expect(tool.draftPoints).toEqual([]);
	});

	it('does not commit a one-point draft and can undo the last point', () => {
		const { state, tool } = createTool();

		tool.appendPoint('route', { x: 0.2, y: 0.3 });
		tool.finish('route');
		expect(state.topo.routes).toEqual([]);

		tool.appendPoint('route', { x: 0.4, y: 0.5 });
		tool.undoLastPoint();
		expect(tool.draftPoints).toEqual([[0.2, 0.3]]);
	});

	it('creates a multipitch pitch and advances to a new pitch target', () => {
		const { state, tool, target } = createTool();

		tool.appendPoint('multipitch', { x: 0, y: 0 });
		tool.appendPoint('multipitch', { x: 1, y: 1 });
		tool.finish('multipitch');

		const route = state.topo.routes[0];
		expect(route).toMatchObject({
			type: 'multi-pitch',
			pitches: [{ pitchNumber: 1, grade: '5a' }]
		});
		expect(target()).toEqual({ type: 'newPitch', routeId: route.id });

		tool.appendPoint('multipitch', { x: 0.2, y: 0.2 });
		tool.appendPoint('multipitch', { x: 0.3, y: 0.3 });
		tool.finish('multipitch');
		expect(route.pitches).toHaveLength(2);
		expect(route.pitches[1].pitchNumber).toBe(2);
	});
});
