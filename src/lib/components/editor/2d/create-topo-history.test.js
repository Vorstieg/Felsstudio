// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createTopoHistory } from './create-topo-history.svelte.js';

function createDocument() {
	return {
		routes: [
			{
				id: 'route-1',
				name: 'Original',
				points: [
					[0, 0],
					[1, 1]
				]
			}
		],
		fixPoints: [],
		outlines: [],
		textLabels: []
	};
}

describe('createTopoHistory', () => {
	it('restores independent snapshots through undo and redo', () => {
		let topo = createDocument();
		const restored = [];
		const history = createTopoHistory({
			getTopo: () => topo,
			restore: (snapshot) => {
				restored.push(snapshot);
				topo = snapshot;
			}
		});

		history.save();
		topo.routes[0].name = 'Edited';
		topo.routes[0].points[0][0] = 99;
		history.save();

		expect(history.undo()).toBe(true);
		expect(topo.routes[0]).toEqual({
			id: 'route-1',
			name: 'Original',
			points: [
				[0, 0],
				[1, 1]
			]
		});
		expect(restored).toHaveLength(1);

		expect(history.redo()).toBe(true);
		expect(topo.routes[0]).toEqual({
			id: 'route-1',
			name: 'Edited',
			points: [
				[99, 0],
				[1, 1]
			]
		});
	});

	it('does not expose undo or redo beyond the history bounds', () => {
		let topo = createDocument();
		const history = createTopoHistory({
			getTopo: () => topo,
			restore: (snapshot) => (topo = snapshot)
		});

		expect(history.undo()).toBe(false);
		expect(history.redo()).toBe(false);

		history.save();
		expect(history.undo()).toBe(false);
		expect(history.redo()).toBe(false);
	});

	it('discards the redo branch after a new edit', () => {
		let topo = createDocument();
		const history = createTopoHistory({
			getTopo: () => topo,
			restore: (snapshot) => (topo = snapshot)
		});

		history.save();
		topo.routes[0].name = 'Second';
		history.save();
		expect(history.undo()).toBe(true);

		topo.routes[0].name = 'Branch';
		history.save();

		expect(history.redo()).toBe(false);
		expect(topo.routes[0].name).toBe('Branch');
	});
});
