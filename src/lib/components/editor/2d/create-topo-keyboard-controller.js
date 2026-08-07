/**
 * Normalizes editor-wide keyboard commands. Tool-specific keys are forwarded
 * only after editor-level shortcuts and cancellation have been handled.
 */
export function createTopoKeyboardController({
	getEditingTextId,
	getActiveTool,
	getCurrentTool,
	getDraftState,
	getSelectedItems,
	getCanvasSize,
	clipboard,
	getTopo,
	selection,
	setActiveTool,
	setDrawingTarget,
	clearSelection,
	deleteSelection,
	recordHistory,
	undo,
	redo,
	setShiftPressed
} = {}) {
	function handleKeyDown(event) {
		if (getEditingTextId?.()) return;
		const isShortcut = event.ctrlKey || event.metaKey;
		const isTextInput = event.target?.closest?.(
			'input, textarea, select, [contenteditable="true"]'
		);

		if (isShortcut && !isTextInput && event.key.toLowerCase() === 'c') {
			if (clipboard?.copy({ topo: getTopo(), selectedItems: getSelectedItems() })) {
				event.preventDefault();
			}
			return;
		}

		if (isShortcut && !isTextInput && event.key.toLowerCase() === 'v') {
			const pasted = clipboard?.paste({ topo: getTopo(), canvasSize: getCanvasSize() });
			if (pasted?.length) {
				event.preventDefault();
				clearSelection?.();
				pasted.forEach(({ type, id }) => selection?.selectObject(type, id, true));
				setActiveTool?.('select');
				recordHistory?.();
			}
			return;
		}

		if (event.key === 'Shift') setShiftPressed?.(true);

		if (event.key === 'Escape') {
			const draft = getDraftState?.() || {};
			if (draft.routePoints > 0 || draft.outlinePoints > 0) {
				getCurrentTool()?.cancel?.();
				return;
			}
			if (getActiveTool() !== 'select') {
				getCurrentTool()?.cancel?.();
				setDrawingTarget?.(null);
				setActiveTool?.('select');
				clearSelection?.();
				return;
			}
			clearSelection?.();
		}

		if (event.key === 'Delete' || event.key === 'Backspace') {
			const selectedItems = getSelectedItems();
			if (selectedItems.size > 0) {
				deleteSelection?.(selectedItems);
				return;
			}
		}

		getCurrentTool()?.onKeyDown?.(event);

		if (isShortcut && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			undo?.();
		} else if (isShortcut && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo?.();
		}
	}

	return { handleKeyDown };
}
