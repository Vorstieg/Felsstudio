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
});
