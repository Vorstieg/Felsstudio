import { describe, expect, it, vi } from 'vitest';
import { OutlineEditTool } from './OutlineEditTool.svelte.js';
import { RouteEditTool } from './RouteEditTool.svelte.js';

const canvasInput = {
	normalizeEvent: () => ({ point: { x: 0.2, y: 0.3 } })
};

describe('persisted path edit tools', () => {
	it('deletes an outline when its path is pressed with the eraser', () => {
		const deleteOutlines = vi.fn(() => true);
		const save = vi.fn();
		const tool = new OutlineEditTool({
			context: { commands: { deleteOutlines }, history: { save } },
			getActiveTool: () => 'eraser'
		});

		expect(tool.handleOutlineDown({ stopPropagation: vi.fn() }, { id: 7 }, canvasInput)).toBe(true);
		expect(deleteOutlines).toHaveBeenCalledWith([7], { recordHistory: false });
		expect(save).toHaveBeenCalledOnce();
	});

	it('snaps edited outline vertices to their own grid', () => {
		const tool = new OutlineEditTool();
		tool.snapToGrid = true;
		tool.gridSize = 0.1;

		expect(tool.snapPoint({ x: 0.16, y: 0.24 })).toEqual({ x: 0.2, y: 0.2 });
	});

	it('returns no grid snap for route vertices when its grid is disabled', () => {
		expect(new RouteEditTool().snapPoint({ x: 0.16, y: 0.24 })).toBeNull();
	});

	it('deletes a route when its path is pressed with the eraser', () => {
		const deleteRoutes = vi.fn(() => true);
		const save = vi.fn();
		const tool = new RouteEditTool({
			context: { commands: { deleteRoutes }, history: { save } },
			getActiveTool: () => 'eraser'
		});

		expect(tool.handleRouteDown({ stopPropagation: vi.fn() }, { id: 'route-1' }, canvasInput)).toBe(
			true
		);
		expect(deleteRoutes).toHaveBeenCalledWith(['route-1'], { recordHistory: false });
		expect(save).toHaveBeenCalledOnce();
	});

	it('uses the shared item interaction to select and drag an outline', () => {
		const selectObject = vi.fn();
		const startInteraction = vi.fn();
		const tool = new OutlineEditTool({
			getActiveTool: () => 'select',
			isSelected: () => false,
			selectObject,
			beginSelectionMove: (mouse) => ({ startMouse: mouse }),
			startInteraction
		});

		expect(tool.handleOutlineDown({ stopPropagation: vi.fn() }, { id: 7 }, canvasInput)).toBe(true);
		expect(selectObject).toHaveBeenCalledWith('outline', 7, false);
		expect(startInteraction).toHaveBeenCalledWith('move-selection', {
			startMouse: { x: 0.2, y: 0.3 }
		});
	});

	it('keeps pitch selection separate from whole-route selection', () => {
		const selectObject = vi.fn();
		const selectPath = vi.fn();
		const setDrawingTarget = vi.fn();
		const tool = new RouteEditTool({
			context: { selection: { selectPath } },
			getActiveTool: () => 'select',
			selectObject,
			setDrawingTarget
		});

		tool.handleRouteDown(
			{ stopPropagation: vi.fn() },
			{ id: 'route-1', pitchId: 'pitch-1' },
			canvasInput
		);

		expect(selectPath).toHaveBeenCalledWith('pitch', 'route-1', 'pitch-1');
		expect(selectObject).not.toHaveBeenCalled();
		expect(setDrawingTarget).toHaveBeenCalledWith({
			type: 'pitch',
			routeId: 'route-1',
			pitchId: 'pitch-1'
		});
	});
});
