// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopo2DEditorState } from './topo-2d-editor-state.svelte.js';

const document = () => ({
	routes: [{ id: 'route-1', points2D: [[0, 0]], pitches: [] }],
	fixPoints: [{ id: 'symbol-1', position2D: [0, 0] }],
	outlines: [],
	textLabels: [{ id: 'text-1', text: 'Existing', position2D: [0.2, 0.3] }]
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
				outlines: []
			}
		});
		editor.selectPath('pitch', 'route-1', 'pitch-1');
		expect([...editor.selectedItems]).toEqual(['route:route-1', 'pitch:pitch-1']);
		expect(editor.ui.selectedRouteId).toBe('route-1');
		expect(editor.ui.selectedPitchId).toBe('pitch-1');
		editor.selectPath('variant', 'route-1', 'variant-1');
		expect(editor.ui.selectedVariantId).toBe('variant-1');
	});

	it('tracks route-point marquee selection separately from object selection', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		editor.selectObject('route', 'route-1');
		const first = { routeId: 'route-1', pitchId: null, variantId: null, index: 0 };
		const second = { routeId: 'route-1', pitchId: null, variantId: null, index: 1 };
		editor.selectRoutePoints([first, second]);

		expect(editor.isRoutePointSelected(first)).toBe(true);
		expect(editor.getSelectedRoutePoints()).toEqual([first, second]);
		expect([...editor.selectedItems]).toEqual(['route:route-1']);
	});

	it('cleans fixpoint references and keeps transient state out of save snapshots', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		editor.topo.name = 'Legacy topo name';
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
		expect(saved).not.toHaveProperty('name');
		expect(saved.routes[0].fixPoints).toEqual([]);
		expect(editor.undo()).toBe(true);
		expect(editor.drafts.route.points).toHaveLength(0);
	});

	it('owns route and outline draft lifecycles', () => {
		const editor = createTopo2DEditorState({
			topo: { routes: [], fixPoints: [], outlines: [] }
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
				outlines: []
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

	it('creates, updates, copies, moves, deletes, and restores text labels', () => {
		const editor = createTopo2DEditorState({ topo: document() });
		const firstId = editor.createTextLabel(
			{ x: 0.4, y: 0.5 },
			{ text: 'Main\nWall', fontSize2D: 32, textAlign2D: 'left' }
		);
		const secondId = editor.createTextLabel({ x: 0.6, y: 0.7 }, { text: 'Second' });
		expect(firstId).not.toBe(secondId);
		expect(editor.ui.selectedTextLabelId).toBe(secondId);

		editor.updateTextLabel(firstId, { color: '#dc2626' });
		editor.selectObject('text', firstId);
		expect(editor.copySelection()).toBe(1);
		const [pasted] = editor.pasteSelection({ baseWidth: 1000, baseHeight: 500 });
		expect(pasted.type).toBe('text');
		const duplicate = editor.topo.textLabels.find((label) => label.id === pasted.id);
		expect(duplicate.position2D[0]).toBeCloseTo(0.416);
		expect(duplicate.position2D[1]).toBeCloseTo(0.532);
		expect(duplicate).toMatchObject({ text: 'Main\nWall', color: '#dc2626' });

		editor.deleteSelection();
		expect(editor.topo.textLabels.some((label) => label.id === pasted.id)).toBe(false);
		expect(editor.undo()).toBe(true);
		expect(editor.topo.textLabels.some((label) => label.id === pasted.id)).toBe(true);
		expect(editor.getSaveSnapshot().textLabels).toHaveLength(4);
	});

	it('supports the public numeric ID form for text-label selection and deletion', () => {
		const editor = createTopo2DEditorState({
			topo: {
				routes: [],
				fixPoints: [],
				outlines: [],
				textLabels: [{ id: 7, text: 'Seven', position2D: [0.1, 0.2] }]
			}
		});
		editor.selectObject('text', 7);
		editor.reconcileSelection();
		expect([...editor.selectedItems]).toEqual(['text:7']);
		editor.deleteSelection();
		expect(editor.topo.textLabels).toEqual([]);
	});
});
