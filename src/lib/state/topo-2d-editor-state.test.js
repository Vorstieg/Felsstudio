// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopo2DEditorState } from './topo-2d-editor-state.svelte.js';

const document = () => ({
	routes: [{ id: 'route-1', points2D: [[0, 0]], pitches: [] }],
	fixPoints: [{ id: 'symbol-1', position2D: [0, 0] }],
	outlines: [],
	textLabels: []
});

describe('createTopo2DEditorState', () => {
	it('creates independent stores with an initial clean history', () => {
		const first = createTopo2DEditorState({ topo: document() });
		const second = createTopo2DEditorState({ topo: document() });

		first.updateRoute('route-1', { name: 'Changed' });
		expect(first.topo.routes[0].name).toBe('Changed');
		expect(second.topo.routes[0].name).toBeUndefined();
		expect(first.hasPendingChanges).toBe(false);
	});

	it('records one entry for a real transaction and none for a no-op', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		editor.commit('noop', () => true);
		expect(editor.history.entries).toHaveLength(0);

		editor.updateRoute('route-1', { name: 'Changed' });
		expect(editor.history.entries).toHaveLength(2);
		editor.undo();
		expect(editor.topo.routes[0].name).toBeUndefined();
		editor.redo();
		expect(editor.topo.routes[0].name).toBe('Changed');
	});

	it('invalidates redo after a new branch and reconciles selection', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		editor.selectItems([
			{ type: 'route', id: 'route-1' },
			{ type: 'symbol', id: 'symbol-1' }
		]);
		expect(editor.ui.selectedRouteId).toBe('route-1');
		editor.removeRoute('route-1');
		expect([...editor.selectedItems]).toEqual(['symbol:symbol-1']);
		expect(editor.ui.selectedRouteId).toBeNull();
		editor.undo();
		expect(editor.ui.selectedRouteId).toBeNull();
		editor.updateRoute('route-1', { name: 'Branch' });
		expect(editor.redo()).toBe(false);
	});

	it('projects nested pitch and variant selection through the same set', () => {
		const editor = createTopo2DEditorState({
			topo: {
				routes: [{ id: 'route-1', pitches: [{ id: 'pitch-1' }], variants: [{ id: 'variant-1' }] }],
				fixPoints: [],
				outlines: [],
				textLabels: []
			}
		});
		editor.selectPath('pitch', 'route-1', 'pitch-1');
		expect([...editor.selectedItems]).toEqual(['route:route-1', 'pitch:pitch-1']);
		expect(editor.ui.selectedRouteId).toBe('route-1');
		expect(editor.ui.selectedPitchId).toBe('pitch-1');
		editor.selectPath('variant', 'route-1', 'variant-1');
		expect(editor.ui.selectedVariantId).toBe('variant-1');
	});

	it('cleans fixpoint references and keeps transient state out of save snapshots', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		editor.topo.routes[0].fixPoints = ['symbol-1'];
		editor.topo.routes[0].pitches = [
			{ id: 'pitch-1', startNodeId: 'symbol-1', endNodeId: 'symbol-1' }
		];
		editor.removeFixpoint('symbol-1');
		expect(editor.topo.routes[0]).toMatchObject({
			fixPoints: [],
			pitches: [{ startNodeId: null, endNodeId: null }]
		});
		editor.beginRouteDraft();
		editor.appendRouteDraftPoint({ x: 0.2, y: 0.3 });
		editor.startInteraction('move-selection', { x: 1 });
		const saved = editor.getSaveSnapshot();
		expect(saved).not.toHaveProperty('drafts');
		expect(saved.routes[0].fixPoints).toEqual([]);
		expect(editor.undo()).toBe(true);
		expect(editor.drafts.route.points).toHaveLength(0);
	});

	it('owns route, outline, and text draft lifecycles', () => {
		const editor = createTopo2DEditorState({
			topo: { routes: [], fixPoints: [], outlines: [], textLabels: [{ id: 'text-1', text: 'Old' }] }
		});
		editor.beginRouteDraft();
		editor.appendRouteDraftPoint({ x: 0, y: 0 });
		editor.appendRouteDraftPoint({ x: 1, y: 1 });
		expect(editor.hasPendingChanges).toBe(true);
		expect(
			editor.commitRouteDraft({
				id: 'route-1',
				points2D: [
					[0, 0],
					[1, 1]
				]
			})
		).toMatchObject({ id: 'route-1' });
		expect(editor.drafts.route.points).toHaveLength(0);

		editor.beginOutlineDraft('polyline');
		editor.updateOutlineDraft([
			[0, 0],
			[1, 1]
		]);
		expect(editor.commitOutlineDraft()).toMatchObject({ mode: 'polyline' });
		editor.beginTextEdit('text-1');
		editor.setTextEditValue('New');
		editor.cancelTextEdit();
		expect(editor.topo.textLabels[0].text).toBe('Old');
	});

	it('clears deleted nested selections and drawing targets', () => {
		const editor = createTopo2DEditorState({
			topo: {
				routes: [
					{
						id: 'route-1',
						pitches: [{ id: 'pitch-1' }],
						variants: [{ id: 'variant-1' }]
					}
				],
				fixPoints: [],
				outlines: [],
				textLabels: []
			}
		});

		editor.selectPath('pitch', 'route-1', 'pitch-1');
		editor.setDrawingTarget({ type: 'pitch', routeId: 'route-1', pitchId: 'pitch-1' });
		editor.removePitch('route-1', 'pitch-1');
		expect(editor.ui.selectedPitchId).toBeNull();
		expect(editor.ui.drawingTarget).toBeNull();

		editor.selectPath('variant', 'route-1', 'variant-1');
		editor.setDrawingTarget({ type: 'variant', routeId: 'route-1', variantId: 'variant-1' });
		editor.removeVariant('route-1', 'variant-1');
		expect(editor.ui.selectedVariantId).toBeNull();
		expect(editor.ui.drawingTarget).toBeNull();
	});

	it('keeps draft controls pending while drawing', () => {
		const editor = createTopo2DEditorState({ topo: document() });

		editor.beginRouteDraft();
		editor.appendRouteDraftPoint({ x: 0.1, y: 0.2 });
		expect(editor.hasPendingChanges).toBe(true);
		editor.cancelRouteDraft();
		expect(editor.hasPendingChanges).toBe(false);

		editor.beginOutlineDraft('rectangle');
		editor.updateOutlineDraft([[0, 0]]);
		expect(editor.hasPendingChanges).toBe(true);
		editor.cancelOutlineDraft();
		expect(editor.hasPendingChanges).toBe(false);

		editor.setActiveTool('multipitch');
		editor.setDrawingTarget({ type: 'newPitch', routeId: 'route-1' });
		expect(editor.hasPendingChanges).toBe(false);
		editor.beginRouteDraft('multipitch');
		editor.appendRouteDraftPoint({ x: 0.2, y: 0.3 });
		expect(editor.hasPendingChanges).toBe(true);
		editor.cancelRouteDraft();
		editor.setDrawingTarget(null);
		expect(editor.hasPendingChanges).toBe(false);
	});
});
