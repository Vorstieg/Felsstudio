export function createTopoEditorActions({
	editor,
	getCurrentTool,
	getDraftState,
	getSelectedOutlineId,
	getOutlineEditTool,
	setDrawingTarget,
	clearSelection
}) {
	function undo() {
		const tool = getCurrentTool();
		const draft = getDraftState();
		if ((tool?.id === 'route' || tool?.id === 'multipitch') && draft.routePoints > 0) {
			tool.undoLastPoint();
			return;
		}
		if (tool?.id === 'outline' && draft.outlinePoints > 0) {
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
		setDrawingTarget(null);
		clearSelection();
	}

	function simplifySelectedOutline(tolerancePx) {
		const outlineId = getSelectedOutlineId();
		return outlineId ? getOutlineEditTool().simplifyOutline(outlineId, tolerancePx) : null;
	}

	return { undo, redo, finalize, cancel, simplifySelectedOutline };
}
