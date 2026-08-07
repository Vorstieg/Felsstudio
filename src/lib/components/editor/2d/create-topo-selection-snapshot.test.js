import { describe, expect, it } from 'vitest';
import { createTopoSelectionSnapshot } from './create-topo-selection-snapshot.js';

describe('createTopoSelectionSnapshot', () => {
	it('captures selected symbols and labels from their current positions', () => {
		const topo = {
			routes: [],
			fixPoints: [{ id: 's1', position2D: [0.1, 0.2] }],
			textLabels: [{ id: 't1', position2D: [0.3, 0.4] }]
		};
		const snapshot = createTopoSelectionSnapshot({
			getTopo: () => topo,
			selectedItems: new Set(['symbol:s1', 'text:t1']),
			getEditablePath: () => null,
			startMouse: { x: 0.5, y: 0.6 }
		});

		expect(snapshot).toEqual({
			items: {
				paths: [],
				symbols: [{ symbolId: 's1', startPos: [0.1, 0.2] }],
				texts: [{ textId: 't1', startPos: [0.3, 0.4] }]
			},
			startMouse: { x: 0.5, y: 0.6 }
		});
	});
});
