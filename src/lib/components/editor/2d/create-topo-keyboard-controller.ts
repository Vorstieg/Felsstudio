type SelectionType = 'route' | 'outline' | 'symbol' | 'text' | 'pitch' | 'variant' | 'path';
type Id = string | number;
type SelectionItem = { type: SelectionType; id: Id };
type CanvasSize = { baseWidth: number; baseHeight: number };

interface TopoKeyboardControllerOptions {
	getCurrentTool?: () => { onKeyDown?: (event: KeyboardEvent) => boolean | void } | null;
	finalize?: () => void;
	cancel?: () => void;
	clipboard?: {
		copy?: () => number;
		paste?: (input?: { canvasSize?: CanvasSize }) => SelectionItem[] | false;
	} | null;
	getCanvasSize?: () => CanvasSize;
	selection?: { selectObject: (type: SelectionType, id: Id, additive?: boolean) => void };
	setActiveTool?: (tool: 'select') => void;
	setDrawingTarget?: (target: null) => void;
	clearSelection?: () => void;
	deleteSelection?: () => void;
	recordHistory?: () => void;
	undo?: () => void;
	redo?: () => void;
	setShiftPressed?: (pressed: boolean) => void;
	onEditSelectedText?: () => boolean;
}

/**
 * Normalizes editor-wide keyboard commands. Tool-specific keys are forwarded
 * only after editor-level shortcuts and cancellation have been handled.
 */
export function createTopoKeyboardController({
	getCurrentTool,
	finalize,
	cancel,
	clipboard,
	getCanvasSize,
	selection,
	setActiveTool,
	setDrawingTarget,
	clearSelection,
	deleteSelection,
	recordHistory,
	undo,
	redo,
	setShiftPressed,
	onEditSelectedText
}: TopoKeyboardControllerOptions) {
	function handleKeyDown(event: KeyboardEvent) {
		const isShortcut = event.ctrlKey || event.metaKey;
		const target = event.target;
		const isTextInput =
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable="true"]');

		if (isTextInput) return;

		if (isShortcut && event.key.toLowerCase() === 'c') {
			if (clipboard?.copy?.()) event.preventDefault();
			return;
		}

		if (isShortcut && event.key.toLowerCase() === 'v') {
			const pasted = clipboard?.paste?.({ canvasSize: getCanvasSize?.() });
			if (Array.isArray(pasted) && pasted.length > 0) {
				event.preventDefault();
				clearSelection?.();
				pasted.forEach(({ type, id }) => selection?.selectObject(type, id, true));
				setActiveTool?.('select');
				setDrawingTarget?.(null);
				recordHistory?.();
			}
			return;
		}

		if (event.key === 'Shift') setShiftPressed?.(true);

		if (event.key === 'Escape') {
			event.preventDefault();
			cancel?.();
			return;
		}

		if (event.key === 'Enter') {
			if (onEditSelectedText?.()) {
				event.preventDefault();
				return;
			}
			if (getCurrentTool?.()?.onKeyDown?.(event) === true) return;
			event.preventDefault();
			finalize?.();
			return;
		}

		if (event.key === 'Delete' || event.key === 'Backspace') {
			deleteSelection?.();
			return;
		}

		getCurrentTool?.()?.onKeyDown?.(event);

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
