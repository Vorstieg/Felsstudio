import { describe, expect, it, vi } from 'vitest';
import { createTopoKeyboardController } from './create-topo-keyboard-controller.js';

describe('createTopoKeyboardController', () => {
	it('forwards delete of a selection as one editor command', () => {
		const deleteSelection = vi.fn();
		const controller = createTopoKeyboardController({
			getEditingTextId: () => null,
			getSelectedItems: () => new Set(['text:a']),
			deleteSelection
		});

		controller.handleKeyDown({ key: 'Delete', target: {} });

		expect(deleteSelection).toHaveBeenCalledWith(new Set(['text:a']));
	});

	it('does not handle shortcuts while editing text', () => {
		const undo = vi.fn();
		const controller = createTopoKeyboardController({
			getEditingTextId: () => 'text-a',
			undo
		});

		controller.handleKeyDown({ key: 'z', ctrlKey: true, target: {} });

		expect(undo).not.toHaveBeenCalled();
	});
});
