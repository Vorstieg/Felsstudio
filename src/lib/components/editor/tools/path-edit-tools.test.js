import { describe, expect, it, vi } from 'vitest';
import { OutlineEditTool } from './OutlineEditTool.svelte.js';
import { RouteEditTool } from './RouteEditTool.svelte.js';

const canvasInput = {
	normalizeEvent: () => ({ point: { x: 0.2, y: 0.3 } })
};

function createEditor(overrides = {}) {
	return {
		topo: { routes: [], outlines: [], fixPoints: [] },
		ui: { activeTool: 'select', isShiftPressed: false, mobileSelectionMode: false },
		selectedItems: new Set(),
		mutateDocument: (mutator) => mutator(),
		startInteraction: vi.fn(),
		saveHistory: vi.fn(),
		isSelected: () => false,
		selectObject: vi.fn(),
		selectPath: vi.fn(),
		selectItems: vi.fn(),
		removeItems: vi.fn(),
		setDrawingTarget: vi.fn(),
		getSelectedRoutePoints: () => [],
		isRoutePointSelected: () => false,
		deleteOutlines: vi.fn(() => true),
		deleteRoutes: vi.fn(() => true),
		updateOutline: vi.fn(),
		...overrides
	};
}

describe('persisted path edit tools', () => {
	it('deletes an outline when its path is pressed with the eraser', () => {
		const editor = createEditor({ ui: { activeTool: 'eraser' } });
		const tool = new OutlineEditTool(editor);

		expect(tool.handleOutlineDown({ stopPropagation: vi.fn() }, { id: 7 }, canvasInput)).toBe(true);
		expect(editor.deleteOutlines).toHaveBeenCalledWith([7], { recordHistory: false });
		expect(editor.saveHistory).toHaveBeenCalledOnce();
	});

	it('snaps edited outline vertices to their own grid', () => {
		const tool = new OutlineEditTool(createEditor());
		tool.snapToGrid = true;
		tool.gridSize = 0.1;

		expect(tool.snapPoint({ x: 0.16, y: 0.24 })).toEqual({ x: 0.2, y: 0.2 });
	});

	it('updates selected outline properties as an undoable edit', () => {
		const outline = { id: 'outline-1', lineStyle: 'rock' };
		const editor = createEditor({ topo: { routes: [], outlines: [outline], fixPoints: [] } });
		const tool = new OutlineEditTool(editor);

		expect(tool.updateProperties('outline-1', { lineStyle: 'fixedRope' })).toBe(true);
		expect(editor.updateOutline).toHaveBeenCalledWith(
			'outline-1',
			{ lineStyle: 'fixedRope' },
			{ recordHistory: false }
		);
		expect(editor.saveHistory).toHaveBeenCalledOnce();
	});

	it('starts preset semantic drags from a stable plain-object snapshot', () => {
		const outline = {
			id: 'corner-1',
			shape: {
				type: 'polyline',
				preset: 'corner',
				semantic: { version: 1 },
				points2D: [
					[0.1, 0.1],
					[0.9, 0.1],
					[0.5, 0.9]
				]
			},
			points2D: [
				[0.1, 0.1],
				[0.9, 0.1],
				[0.5, 0.9]
			]
		};
		const editor = createEditor({ topo: { routes: [], outlines: [outline], fixPoints: [] } });
		const tool = new OutlineEditTool(editor);
		const interaction = tool.createSemanticInteraction(
			{ outlineId: 'corner-1', id: 'lean' },
			{ x: 0.5, y: 0.1 }
		);

		expect(interaction.outlineSnapshot).not.toBe(outline);
		tool.applySemanticTransform(interaction, { x: 0.58, y: 0.1 });
		const changes = editor.updateOutline.mock.calls[0][1];
		expect(editor.updateOutline).toHaveBeenCalledWith('corner-1', changes, {
			recordHistory: false
		});
		expect(changes.shape.semantic.lean).toBeCloseTo(0.1);
	});

	it('returns no grid snap for route vertices when its grid is disabled', () => {
		expect(new RouteEditTool(createEditor()).snapPoint({ x: 0.16, y: 0.24 })).toBeNull();
	});

	it('deletes a route when its path is pressed with the eraser', () => {
		const editor = createEditor({ ui: { activeTool: 'eraser' } });
		const tool = new RouteEditTool(editor);

		expect(tool.handleRouteDown({ stopPropagation: vi.fn() }, { id: 'route-1' }, canvasInput)).toBe(
			true
		);
		expect(editor.deleteRoutes).toHaveBeenCalledWith(['route-1'], { recordHistory: false });
		expect(editor.saveHistory).toHaveBeenCalledOnce();
	});

	it('ignores emulated mouse deletion after a touch route deletion', () => {
		const editor = createEditor({ ui: { activeTool: 'eraser' } });
		const tool = new RouteEditTool(editor);
		const input = { ...canvasInput, trackTouch: vi.fn() };
		const touch = { identifier: 1, clientX: 10, clientY: 20 };

		expect(
			tool.handleTouchRouteDown(
				{ touches: [touch], preventDefault: vi.fn(), stopPropagation: vi.fn() },
				{ id: 'route-1' },
				input
			)
		).toBe(true);
		expect(
			tool.handleRouteDown(
				{ type: 'mousedown', clientX: 10, clientY: 20, preventDefault: vi.fn(), stopPropagation: vi.fn() },
				{ id: 'route-2' },
				input
			)
		).toBe(true);
		expect(editor.deleteRoutes).toHaveBeenCalledOnce();
	});

	it('uses the shared item interaction to select and drag an outline', () => {
		const editor = createEditor();
		const tool = new OutlineEditTool(editor, {
			beginSelectionMove: (mouse) => ({ startMouse: mouse })
		});

		expect(tool.handleOutlineDown({ stopPropagation: vi.fn() }, { id: 7 }, canvasInput)).toBe(true);
		expect(editor.selectObject).toHaveBeenCalledWith('outline', 7, false);
		expect(editor.startInteraction).toHaveBeenCalledWith('move-selection', {
			startMouse: { x: 0.2, y: 0.3 }
		});
	});

	it('keeps pitch selection separate from whole-route selection', () => {
		const editor = createEditor();
		const tool = new RouteEditTool(editor);

		tool.handleRouteDown(
			{ stopPropagation: vi.fn() },
			{ id: 'route-1', pitchId: 'pitch-1' },
			canvasInput
		);

		expect(editor.selectPath).toHaveBeenCalledWith('pitch', 'route-1', 'pitch-1');
		expect(editor.selectObject).not.toHaveBeenCalled();
		expect(editor.setDrawingTarget).toHaveBeenCalledWith({
			type: 'pitch',
			routeId: 'route-1',
			pitchId: 'pitch-1'
		});
	});

	it('deselects an already selected multipitch pitch without clearing the route', () => {
		const editor = createEditor({
			isSelected: (type, id) => type === 'pitch' && id === 'pitch-1'
		});
		const tool = new RouteEditTool(editor);

		tool.handleRouteDown(
			{ stopPropagation: vi.fn() },
			{ id: 'route-1', pitchId: 'pitch-1' },
			canvasInput
		);

		expect(editor.selectObject).toHaveBeenCalledWith('route', 'route-1', false);
		expect(editor.setDrawingTarget).toHaveBeenCalledWith(null);
		expect(editor.selectPath).not.toHaveBeenCalled();
	});

	it('toggles only the nested pitch during mobile multi-selection', () => {
		const editor = createEditor({
			ui: { activeTool: 'select', isShiftPressed: false, mobileSelectionMode: true },
			isSelected: (type, id) => type === 'pitch' && id === 'pitch-1'
		});
		const tool = new RouteEditTool(editor);

		tool.handleRouteDown(
			{ identifier: 1, stopPropagation: vi.fn() },
			{ id: 'route-1', pitchId: 'pitch-1' },
			canvasInput
		);

		expect(editor.removeItems).toHaveBeenCalledWith([{ type: 'pitch', id: 'pitch-1' }]);
		expect(editor.selectObject).not.toHaveBeenCalled();
		expect(editor.setDrawingTarget).toHaveBeenCalledWith(null);
	});

	it('toggles only the nested pitch during desktop shift multi-selection', () => {
		const editor = createEditor({
			ui: { activeTool: 'select', isShiftPressed: true, mobileSelectionMode: false },
			isSelected: (type, id) => type === 'pitch' && id === 'pitch-1'
		});
		const tool = new RouteEditTool(editor);

		tool.handleRouteDown(
			{ stopPropagation: vi.fn() },
			{ id: 'route-1', pitchId: 'pitch-1' },
			canvasInput
		);

		expect(editor.removeItems).toHaveBeenCalledWith([{ type: 'pitch', id: 'pitch-1' }]);
		expect(editor.selectObject).not.toHaveBeenCalled();
		expect(editor.setDrawingTarget).toHaveBeenCalledWith(null);
	});
});
