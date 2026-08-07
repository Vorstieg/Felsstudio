import { describe, expect, it, vi } from 'vitest';
import { createTopoPointerController } from './create-topo-pointer-controller.js';

describe('createTopoPointerController', () => {
	it('starts a selection region on select-tool pointer down', () => {
		const startInteraction = vi.fn();
		const controller = createTopoPointerController({
			getActiveTool: () => 'select',
			getMobileSelectionMode: () => false,
			onBeginSelectionRegion: startInteraction
		});

		controller.down({
			point: { x: 0.2, y: 0.3 },
			sourceEvent: { shiftKey: true },
			button: 0,
			isTouch: false,
			shiftKey: true
		});

		expect(startInteraction).toHaveBeenCalledWith({
			start: { x: 0.2, y: 0.3 },
			end: { x: 0.2, y: 0.3 },
			mode: 'add'
		});
	});
});
