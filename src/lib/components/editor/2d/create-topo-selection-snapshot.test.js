import { describe, expect, it } from 'vitest';
import { createTopoSelectionSnapshot } from './create-topo-selection-snapshot.ts';

describe('createTopoSelectionSnapshot', () => {
	it('captures selected symbols and labels from their current positions', () => {
		const topo = {
			routes: [],
			fixPoints: [{ id: 's1', position2D: [0.1, 0.2] }],
			textLabels: [{ id: 't1', text: 'Label', position2D: [0.3, 0.4] }]
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

	it('matches numeric document IDs from selected item keys', () => {
		const topo = {
			routes: [{ id: 12, points2D: [[0.1, 0.2]] }],
			fixPoints: [{ id: 34, position2D: [0.3, 0.4] }],
			textLabels: [{ id: 56, text: 'Numeric', position2D: [0.5, 0.6] }]
		};
		const snapshot = createTopoSelectionSnapshot({
			getTopo: () => topo,
			selectedItems: new Set(['route:12', 'symbol:34', 'text:56']),
			getEditablePath: () => ({
				getPoints: () => [[0.1, 0.2]],
				snapshot: () => [[0.1, 0.2]]
			}),
			startMouse: { x: 0.7, y: 0.8 }
		});

		expect(snapshot.items.paths).toHaveLength(1);
		expect(snapshot.items.paths[0].target).toEqual({ routeId: 12 });
		expect(snapshot.items.symbols).toEqual([{ symbolId: '34', startPos: [0.3, 0.4] }]);
		expect(snapshot.items.texts).toEqual([{ textId: '56', startPos: [0.5, 0.6] }]);
	});
});
