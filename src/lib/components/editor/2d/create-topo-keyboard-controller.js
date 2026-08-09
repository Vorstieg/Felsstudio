/**
 * Normalizes editor-wide keyboard commands. Tool-specific keys are forwarded
 * only after editor-level shortcuts and cancellation have been handled.
 */
export function createTopoKeyboardController({
	getCurrentTool,
	finalize,
	cancel,
	getSelectedItems,
	getCanvasSize,
	clipboard,
	getTopo,
	selection,
	setActiveTool,
	clearSelection,
	deleteSelection,
	recordHistory,
	undo,
	redo,
	setShiftPressed,
	onEditSelectedText
} = {}) {
	function handleKeyDown(event) {
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
			event.preventDefault?.();
			cancel?.();
			return;
		}

		if (event.key === 'Enter') {
			if (onEditSelectedText?.()) {
				event.preventDefault?.();
				return;
			}
			if (getCurrentTool?.()?.onKeyDown?.(event) === true) return;
			event.preventDefault?.();
			finalize?.();
			return;
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
