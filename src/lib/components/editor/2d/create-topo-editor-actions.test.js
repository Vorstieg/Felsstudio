import { describe, expect, it, vi } from 'vitest';
import { createTopoEditorActions } from './create-topo-editor-actions.js';

describe('createTopoEditorActions', () => {
	it('undoes a draft point before touching history', () => {
		const tool = { id: 'route', undoLastPoint: vi.fn() };
		const editor = { history: { undo: vi.fn(), redo: vi.fn() } };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => tool,
			getDraftState: () => ({ routePoints: 2, outlinePoints: 0 }),
			getSelectedOutlineId: () => null,
			getOutlineEditTool: () => null,
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn()
		});

		actions.undo();

		expect(tool.undoLastPoint).toHaveBeenCalledOnce();
		expect(editor.history.undo).not.toHaveBeenCalled();
	});

	it('cancels the active tool and clears its drawing target', () => {
		const tool = { cancel: vi.fn() };
		const setDrawingTarget = vi.fn();
		const clearSelection = vi.fn();
		const actions = createTopoEditorActions({
			editor: { history: {} },
			getCurrentTool: () => tool,
			getDraftState: () => ({ routePoints: 0, outlinePoints: 0 }),
			getSelectedOutlineId: () => null,
			getOutlineEditTool: () => null,
			setDrawingTarget,
			clearSelection
		});

		actions.cancel();

		expect(tool.cancel).toHaveBeenCalledOnce();
		expect(setDrawingTarget).toHaveBeenCalledWith(null);
		expect(clearSelection).toHaveBeenCalledOnce();
	});

	it('finishes the active tool and returns to select, except for multipitch', () => {
		const tool = { finalize: vi.fn() };
		const setActiveTool = vi.fn();
		const actions = createTopoEditorActions({
			editor: { history: {} },
			getCurrentTool: () => tool,
			getActiveTool: () => 'route',
			setActiveTool,
			getDraftState: () => ({ routePoints: 2, outlinePoints: 0 }),
			getSelectedOutlineId: () => null,
			getOutlineEditTool: () => null,
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn()
		});

		actions.finalize();

		expect(tool.finalize).toHaveBeenCalledOnce();
		expect(setActiveTool).toHaveBeenCalledWith('select');
	});

	it('keeps multipitch active for its second finish action', () => {
		const setActiveTool = vi.fn();
		const actions = createTopoEditorActions({
			editor: { history: {} },
			getCurrentTool: () => ({ finalize: vi.fn() }),
			getActiveTool: () => 'multipitch',
			setActiveTool,
			getDraftState: () => ({ routePoints: 0, outlinePoints: 0 }),
			getSelectedOutlineId: () => null,
			getOutlineEditTool: () => null,
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn()
		});

		actions.finalize();

		expect(setActiveTool).not.toHaveBeenCalled();
	});

	it('cancels through the shared action and returns to select', () => {
		const setActiveTool = vi.fn();
		const actions = createTopoEditorActions({
			editor: { history: {} },
			getCurrentTool: () => ({ cancel: vi.fn() }),
			getActiveTool: () => 'route',
			setActiveTool,
			getDraftState: () => ({ routePoints: 2, outlinePoints: 0 }),
			getSelectedOutlineId: () => null,
			getOutlineEditTool: () => null,
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn()
		});

		actions.cancel();

		expect(setActiveTool).toHaveBeenCalledWith('select');
	});
});
