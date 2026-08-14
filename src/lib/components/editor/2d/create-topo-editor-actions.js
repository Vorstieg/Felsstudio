export function createTopoEditorActions({ editor, getCurrentTool, outlineEditTool }) {
	function undo() {
		const tool = getCurrentTool();
		if ((tool?.id === 'route' || tool?.id === 'multipitch') && tool.draftPoints.length > 0) {
			tool.undoLastPoint();
			return;
		}
		if (tool?.id === 'outline' && tool.getPreviewPoints().length > 0) {
			tool.undoLastPoint();
			return;
		}
		(editor.undo || editor.history.undo)();
	}

	function redo() {
		(editor.redo || editor.history.redo)();
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

	function simplifySelectedOutline(tolerancePx) {
		const outlineId = editor.ui.selectedOutlineId;
		return outlineId ? outlineEditTool.simplifyOutline(outlineId, tolerancePx) : null;
	}

	return { undo, redo, finalize, cancel, simplifySelectedOutline };
}
