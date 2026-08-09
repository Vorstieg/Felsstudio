import { describe, expect, it, vi } from 'vitest';
import { createTopoKeyboardController } from './create-topo-keyboard-controller.js';

describe('createTopoKeyboardController', () => {
	it('forwards delete of a selection as one editor command', () => {
		const deleteSelection = vi.fn();
		const controller = createTopoKeyboardController({
			getSelectedItems: () => new Set(['text:a']),
			deleteSelection
		});

		controller.handleKeyDown({ key: 'Delete', target: {} });

		expect(deleteSelection).toHaveBeenCalledWith(new Set(['text:a']));
	});

	it('routes Enter and Escape through the shared editor actions', () => {
		const finalize = vi.fn();
		const cancel = vi.fn();
		const preventDefault = vi.fn();
		const controller = createTopoKeyboardController({ finalize, cancel });

		controller.handleKeyDown({ key: 'Enter', target: {}, preventDefault });
		controller.handleKeyDown({ key: 'Escape', target: {}, preventDefault });

		expect(finalize).toHaveBeenCalledOnce();
		expect(cancel).toHaveBeenCalledOnce();
		expect(preventDefault).toHaveBeenCalledTimes(2);
	});

	it('opens the composer when Enter is pressed with a text label selected', () => {
		const onEditSelectedText = vi.fn(() => true);
		const finalize = vi.fn();
		const preventDefault = vi.fn();
		const controller = createTopoKeyboardController({ onEditSelectedText, finalize });

		controller.handleKeyDown({ key: 'Enter', target: {}, preventDefault });

		expect(onEditSelectedText).toHaveBeenCalledOnce();
		expect(preventDefault).toHaveBeenCalledOnce();
		expect(finalize).not.toHaveBeenCalled();
	});
});
