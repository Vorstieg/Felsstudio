import { describe, expect, it, vi } from 'vitest';
import { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.js';

describe('createTopoObjectInteractionController', () => {
	it('selects an object and starts a move interaction', () => {
		const selectObject = vi.fn();
		const startInteraction = vi.fn();
		const controller = createTopoObjectInteractionController({
			getActiveTool: () => 'select',
			normalizeEvent: () => ({ point: { x: 0.2, y: 0.3 } }),
			getMobileSelectionMode: () => false,
			getIsShiftPressed: () => false,
			getDraftState: () => ({ routePoints: 0, outlinePoints: 0 }),
			selection: { isSelected: () => false, selectObject, startInteraction },
			createSelectionSnapshot: (point) => ({ items: {}, startMouse: point }),
			setDrawingTarget: vi.fn()
		});

		controller.objectMouseDown({ stopPropagation: vi.fn() }, { type: 'symbol', id: 's1' });

		expect(selectObject).toHaveBeenCalledWith('symbol', 's1', false);
		expect(startInteraction).toHaveBeenCalledWith('move-selection', {
			items: {},
			startMouse: { x: 0.2, y: 0.3 }
		});
	});
});
