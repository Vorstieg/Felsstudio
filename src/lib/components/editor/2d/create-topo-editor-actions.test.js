import { describe, expect, it, vi } from 'vitest';
import { createTopoEditorActions } from './create-topo-editor-actions.ts';

describe('createTopoEditorActions', () => {
	it('undoes a draft point before calling editor undo', () => {
		const tool = { id: 'route', draftPoints: [[0.1, 0.2]], undoLastPoint: vi.fn() };
		const editor = { undo: vi.fn(), redo: vi.fn() };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => tool,
			outlineEditTool: null
		});

		actions.undo();

		expect(tool.undoLastPoint).toHaveBeenCalledOnce();
		expect(editor.undo).not.toHaveBeenCalled();
	});

	it('uses the editor undo and redo actions when no draft point is active', () => {
		const editor = { undo: vi.fn(), redo: vi.fn() };
		const actions = createTopoEditorActions({
			editor,
			getCurrentTool: () => null,
			outlineEditTool: null
		});

		actions.undo();
		actions.redo();

		expect(editor.undo).toHaveBeenCalledOnce();
		expect(editor.redo).toHaveBeenCalledOnce();
	});

	it('cancels the active tool and clears its drawing target', () => {
		const tool = { cancel: vi.fn() };
		const editor = {
			undo: vi.fn(),
			redo: vi.fn(),
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
		const editor = { undo: vi.fn(), redo: vi.fn(), setActiveTool: vi.fn() };
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
		const editor = { undo: vi.fn(), redo: vi.fn(), setActiveTool: vi.fn() };
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
			undo: vi.fn(),
			redo: vi.fn(),
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
