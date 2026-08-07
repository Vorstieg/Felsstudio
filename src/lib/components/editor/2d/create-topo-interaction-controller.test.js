import { describe, expect, it, vi } from 'vitest';
import { createTopoInteractionController } from './create-topo-interaction-controller.js';

describe('createTopoInteractionController', () => {
	it('moves selected symbols from their interaction snapshot', () => {
		const topo = {
			fixPoints: [{ id: 'symbol-1', position2D: [0.1, 0.2] }],
			textLabels: [],
			routes: []
		};
		const controller = createTopoInteractionController({
			getTopo: () => topo,
			getInteraction: () => ({
				kind: 'move-selection',
				startMouse: { x: 0.2, y: 0.2 },
				items: { paths: [], symbols: [{ symbolId: 'symbol-1', startPos: [0.1, 0.2] }], texts: [] }
			}),
			getCurrentTool: () => ({ onMouseMove: vi.fn() })
		});

		controller.update({ point: { x: 0.3, y: 0.5 }, sourceEvent: {} });

		expect(topo.fixPoints[0].position2D[0]).toBeCloseTo(0.2);
		expect(topo.fixPoints[0].position2D[1]).toBeCloseTo(0.5);
	});
});
