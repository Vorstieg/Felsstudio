import { describe, expect, it, vi } from 'vitest';
import { createTopoKeyboardController } from './create-topo-keyboard-controller.ts';

const keyEvent = (key, options = {}) => {
	const event = new KeyboardEvent('keydown', { key, cancelable: true, ...options });
	return event;
};

describe('createTopoKeyboardController', () => {
	it('forwards delete to the editor selection command', () => {
		const deleteSelection = vi.fn();
		const controller = createTopoKeyboardController({ deleteSelection });

		controller.handleKeyDown(keyEvent('Delete'));

		expect(deleteSelection).toHaveBeenCalledOnce();
	});

	it('ignores editing keys from form fields', () => {
		const deleteSelection = vi.fn();
		const finalize = vi.fn();
		const cancel = vi.fn();
		const controller = createTopoKeyboardController({ deleteSelection, finalize, cancel });
		const input = document.createElement('input');
		document.body.append(input);

		for (const key of ['Backspace', 'Enter', 'Escape']) {
			const event = keyEvent(key);
			Object.defineProperty(event, 'target', { value: input });
			controller.handleKeyDown(event);
		}

		expect(deleteSelection).not.toHaveBeenCalled();
		expect(finalize).not.toHaveBeenCalled();
		expect(cancel).not.toHaveBeenCalled();
		input.remove();
	});

	it('routes Enter and Escape through the shared editor actions', () => {
		const finalize = vi.fn();
		const cancel = vi.fn();
		const controller = createTopoKeyboardController({ finalize, cancel });

		const enter = keyEvent('Enter');
		const escape = keyEvent('Escape');
		controller.handleKeyDown(enter);
		controller.handleKeyDown(escape);

		expect(finalize).toHaveBeenCalledOnce();
		expect(cancel).toHaveBeenCalledOnce();
		expect(enter.defaultPrevented).toBe(true);
		expect(escape.defaultPrevented).toBe(true);
	});

	it('opens the composer when Enter is pressed with a text label selected', () => {
		const onEditSelectedText = vi.fn(() => true);
		const finalize = vi.fn();
		const controller = createTopoKeyboardController({ onEditSelectedText, finalize });
		const enter = keyEvent('Enter');

		controller.handleKeyDown(enter);

		expect(onEditSelectedText).toHaveBeenCalledOnce();
		expect(enter.defaultPrevented).toBe(true);
		expect(finalize).not.toHaveBeenCalled();
	});

	it('pastes editor clipboard contents, selects pasted items, and resets drawing target', () => {
		const selectObject = vi.fn();
		const clearSelection = vi.fn();
		const setActiveTool = vi.fn();
		const setDrawingTarget = vi.fn();
		const recordHistory = vi.fn();
		const paste = vi.fn(() => [{ type: 'text', id: 4 }]);
		const controller = createTopoKeyboardController({
			clipboard: { paste },
			getCanvasSize: () => ({ baseWidth: 800, baseHeight: 600 }),
			selection: { selectObject },
			clearSelection,
			setActiveTool,
			setDrawingTarget,
			recordHistory
		});
		const event = keyEvent('v', { ctrlKey: true });

		controller.handleKeyDown(event);

		expect(paste).toHaveBeenCalledWith({ canvasSize: { baseWidth: 800, baseHeight: 600 } });
		expect(clearSelection).toHaveBeenCalledOnce();
		expect(selectObject).toHaveBeenCalledWith('text', 4, true);
		expect(setActiveTool).toHaveBeenCalledWith('select');
		expect(setDrawingTarget).toHaveBeenCalledWith(null);
		expect(recordHistory).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(true);
	});
});
