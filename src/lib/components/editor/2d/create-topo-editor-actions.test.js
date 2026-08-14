import { describe, expect, it, vi } from 'vitest';
import { createTopoEditorActions } from './create-topo-editor-actions.js';

describe('createTopoEditorActions', () => {
	it('undoes a draft point before touching history', () => {
		const tool = { id: 'route', draftPoints: [[0.1, 0.2]], undoLastPoint: vi.fn() };
		const editor = { history: { undo: vi.fn(), redo: vi.fn() } };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => tool,
			outlineEditTool: null
		});

		actions.undo();

		expect(tool.undoLastPoint).toHaveBeenCalledOnce();
		expect(editor.history.undo).not.toHaveBeenCalled();
	});

	it('cancels the active tool and clears its drawing target', () => {
		const tool = { cancel: vi.fn() };
		const editor = {
			history: {},
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn(),
			setActiveTool: vi.fn()
		};
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => tool,
			outlineEditTool: null
		});

		actions.cancel();

		expect(tool.cancel).toHaveBeenCalledOnce();
		expect(editor.setDrawingTarget).toHaveBeenCalledWith(null);
		expect(editor.clearSelection).toHaveBeenCalledOnce();
	});

	it('finishes while keeping the route tool active for consecutive routes', () => {
		const tool = { finalize: vi.fn() };
		const editor = { history: {}, setActiveTool: vi.fn() };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => tool,
			outlineEditTool: null
		});

		actions.finalize();

		expect(tool.finalize).toHaveBeenCalledOnce();
		expect(editor.setActiveTool).not.toHaveBeenCalled();
	});

	it('keeps multipitch active for its second finish action', () => {
		const editor = { history: {}, setActiveTool: vi.fn() };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => ({ finalize: vi.fn() }),
			outlineEditTool: null
		});

		actions.finalize();

		expect(editor.setActiveTool).not.toHaveBeenCalled();
	});

	it('cancels through the shared action and returns to select', () => {
		const editor = {
			history: {},
			setDrawingTarget: vi.fn(),
			clearSelection: vi.fn(),
			setActiveTool: vi.fn()
		};
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => ({ cancel: vi.fn() }),
			outlineEditTool: null
		});

		actions.cancel();

		expect(editor.setActiveTool).toHaveBeenCalledWith('select');
	});
});
