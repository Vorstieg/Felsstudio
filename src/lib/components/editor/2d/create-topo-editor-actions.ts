interface DraftTool {
	id?: string;
	draftPoints?: unknown[];
	getPreviewPoints?: () => unknown[];
	undoLastPoint?: () => void;
	finalize?: () => void;
	cancel?: () => void;
	onKeyDown?: (event: { key: string }) => void;
}

interface EditorActionsState {
	ui: { selectedOutlineId: string | number | null };
	undo: () => void;
	redo: () => void;
	setDrawingTarget: (target: null) => void;
	clearSelection: () => void;
	setActiveTool: (tool: 'select') => void;
}

interface TopoEditorActionsOptions {
	editor: EditorActionsState;
	getCurrentTool: () => DraftTool | null | undefined;
	outlineEditTool: Pick<OutlineEditTool, 'simplifyOutline'>;
}

export function createTopoEditorActions({
	editor,
	getCurrentTool,
	outlineEditTool
}: TopoEditorActionsOptions) {
	function undo() {
		const tool = getCurrentTool();
		if (
			(tool?.id === 'route' || tool?.id === 'multipitch') &&
			(tool.draftPoints?.length ?? 0) > 0
		) {
			tool.undoLastPoint?.();
			return;
		}
		if (tool?.id === 'outline' && (tool.getPreviewPoints?.().length ?? 0) > 0) {
			tool.undoLastPoint?.();
			return;
		}
		editor.undo();
	}

	function redo() {
		editor.redo();
	}

	function finalize() {
		getCurrentTool()?.finalize?.();
	}

	function cancel() {
		const tool = getCurrentTool();
		if (tool?.cancel) tool.cancel();
		else tool?.onKeyDown?.({ key: 'Escape' });
		editor.setDrawingTarget(null);
		editor.clearSelection();
		editor.setActiveTool('select');
	}

	function simplifySelectedOutline(tolerancePx: number) {
		const outlineId = editor.ui.selectedOutlineId;
		return outlineId ? outlineEditTool.simplifyOutline(outlineId, tolerancePx) : null;
	}

	return { undo, redo, finalize, cancel, simplifySelectedOutline };
}
import type { OutlineEditTool } from '../tools/OutlineEditTool.svelte.ts';
