import { describe, expect, it, vi } from 'vitest';
import { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.js';

describe('createTopoObjectInteractionController', () => {
	it('selects an object and starts a move interaction', () => {
		const editor = {
			ui: { activeTool: 'select', mobileSelectionMode: false, isShiftPressed: false },
			isSelected: () => false,
			selectObject: vi.fn(),
			startInteraction: vi.fn()
		};
		const controller = createTopoObjectInteractionController({
			editor,
			canvasInput: { normalizeEvent: () => ({ point: { x: 0.2, y: 0.3 } }) },
			createSelectionSnapshot: (point) => ({ items: {}, startMouse: point })
		});

		controller.objectMouseDown({ stopPropagation: vi.fn() }, { type: 'symbol', id: 's1' });

		expect(editor.selectObject).toHaveBeenCalledWith('symbol', 's1', false);
		expect(editor.startInteraction).toHaveBeenCalledWith('move-selection', {
			items: {},
			startMouse: { x: 0.2, y: 0.3 }
		});
	});
});
