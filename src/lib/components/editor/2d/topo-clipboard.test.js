// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopoClipboard } from './topo-clipboard.js';
import fixture from '../../../../../tests/fixtures/2d/mixed-topo.json';

describe('createTopoClipboard', () => {
	it('copies selected outlines and symbols with fresh IDs and offsets', () => {
		const topo = structuredClone(fixture);
		const clipboard = createTopoClipboard();
		const before = structuredClone(topo);

		expect(
			clipboard.copy({
				topo,
				selectedItems: new Set(['outline:outline-polyline', 'symbol:symbol-1'])
			})
		).toBe(2);

		const pasted = clipboard.paste({ topo, canvasSize: { baseWidth: 1000, baseHeight: 500 } });

		expect(pasted).toHaveLength(2);
		expect(new Set(pasted.map((item) => item.id)).size).toBe(2);
		expect(topo.outlines).toHaveLength(before.outlines.length + 1);
		expect(topo.fixPoints).toHaveLength(before.fixPoints.length + 1);
		expect(topo.outlines.at(-1).points2D[0]).toEqual([0.096, 0.232]);
		expect(topo.fixPoints.at(-1).position2D).toEqual([0.736, 0.28200000000000003]);
		expect(topo.outlines[0]).toEqual(before.outlines[0]);
	});

	it('returns no paste when the clipboard is empty', () => {
		const topo = structuredClone(fixture);
		expect(
			createTopoClipboard().paste({ topo, canvasSize: { baseWidth: 1000, baseHeight: 667 } })
		).toEqual([]);
	});
});
