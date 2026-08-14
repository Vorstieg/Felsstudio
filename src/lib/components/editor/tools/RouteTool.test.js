// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { RouteTool } from './RouteTool.svelte.js';
import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';

function createTool() {
	const state = createTopo2DEditorState({
		topo: { routes: [], fixPoints: [], outlines: [], textLabels: [] }
	});
	const tool = new RouteTool(state, {
		snapPoint: (point) => ({ point, anchorId: point.anchorId || null }),
		referenceFixpoint: vi.fn()
	});
	return { state, tool, target: () => state.ui.drawingTarget };
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
		expect(state.ui.selectedRouteId).toBeNull();
		expect(tool.draftPoints).toEqual([]);
	});

	it('finalizes a route when the store provides nested selection commands', () => {
		const { state, tool } = createTool();
		tool.selectPath = vi.fn();

		tool.appendPoint('route', { x: 0.1, y: 0.2 });
		tool.appendPoint('route', { x: 0.8, y: 0.9 });
		tool.finish('route');

		expect(state.topo.routes).toHaveLength(1);
		expect(tool.selectPath).not.toHaveBeenCalled();
		expect(state.ui.selectedRouteId).toBeNull();
	});

	it('keeps a store-backed two-point route draft pending until it is finished', () => {
		const editor = createTopo2DEditorState({
			topo: { routes: [], fixPoints: [], outlines: [], textLabels: [] }
		});
		const tool = new RouteTool(editor);

		tool.appendPoint('route', { x: 0.1, y: 0.2 });
		tool.appendPoint('route', { x: 0.8, y: 0.9 });
		expect(editor.hasPendingChanges).toBe(true);
		expect(tool.draftPoints).toHaveLength(2);
	});

	it('uses the current draft after the editor reloads its session', () => {
		const editor = createTopo2DEditorState({
			topo: { routes: [], fixPoints: [], outlines: [], textLabels: [] }
		});
		const tool = new RouteTool(editor);

		editor.load({ routes: [], fixPoints: [], outlines: [], textLabels: [] });
		tool.appendPoint('route', { x: 0.1, y: 0.2 });
		tool.appendPoint('route', { x: 0.8, y: 0.9 });

		expect(editor.drafts.route.points).toEqual([
			[0.1, 0.2],
			[0.8, 0.9]
		]);
		expect(editor.hasPendingChanges).toBe(true);
	});

	it('creates the second pitch through the centralized store', () => {
		const editor = createTopo2DEditorState({
			topo: { routes: [], fixPoints: [], outlines: [], textLabels: [] }
		});
		const tool = new RouteTool(editor);
		tool.mode = tool.id = 'multipitch';

		tool.appendPoint('multipitch', { x: 0, y: 0 });
		tool.appendPoint('multipitch', { x: 1, y: 1 });
		tool.finish('multipitch');
		const route = editor.topo.routes[0];
		expect(editor.ui.drawingTarget).toEqual({ type: 'newPitch', routeId: route.id });

		tool.appendPoint('multipitch', { x: 0.2, y: 0.2 });
		tool.appendPoint('multipitch', { x: 0.3, y: 0.3 });
		tool.finish('multipitch');

		expect(route.pitches).toHaveLength(2);
		expect(route.pitches[1].pitchNumber).toBe(2);
	});

	it('commits a second pitch when the document topo is external to the editor snapshot', () => {
		const topo = { routes: [], fixPoints: [], outlines: [], textLabels: [] };
		const editor = createTopo2DEditorState({
			getTopo: () => topo,
			setTopo: (next) => Object.assign(topo, next)
		});
		const tool = new RouteTool(editor);
		tool.mode = tool.id = 'multipitch';

		tool.appendPoint('multipitch', { x: 0, y: 0 });
		tool.appendPoint('multipitch', { x: 1, y: 1 });
		tool.finish('multipitch');
		tool.appendPoint('multipitch', { x: 0.2, y: 0.2 });
		tool.appendPoint('multipitch', { x: 0.3, y: 0.3 });
		tool.finish('multipitch');

		expect(topo.routes[0].pitches).toHaveLength(2);
		expect(topo.routes[0].pitches[1].pitchNumber).toBe(2);
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

	it('keeps an incomplete draft when approval is pressed early', () => {
		const { state, tool } = createTool();

		tool.appendPoint('route', { x: 0.2, y: 0.3 });
		tool.finish('route');

		expect(state.topo.routes).toEqual([]);
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

	it('draws the first pitch for a multi-pitch route imported from the crag editor', () => {
		const { state, tool, target } = createTool();
		state.topo.routes.push({
			id: 'crag-route-1',
			type: ['multi-pitch'],
			pitches: [{ id: 'pitch-1', pitchNumber: 1, points2D: [] }]
		});
		tool.setDrawingTarget({ type: 'pitch', routeId: 'crag-route-1', pitchId: 'pitch-1' });

		tool.appendPoint('multipitch', { x: 0.2, y: 0.3 });
		tool.appendPoint('multipitch', { x: 0.6, y: 0.7 });
		tool.finish('multipitch');

		expect(state.topo.routes[0].pitches).toHaveLength(1);
		expect(state.topo.routes[0].pitches[0]).toMatchObject({
			pitchNumber: 1,
			points2D: [
				[0.2, 0.3],
				[0.6, 0.7]
			]
		});
		expect(target()).toEqual({ type: 'newPitch', routeId: 'crag-route-1' });
	});
});
