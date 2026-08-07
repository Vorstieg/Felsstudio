import { describe, expect, it, vi } from 'vitest';
import { createTopoEditCommands } from './create-topo-edit-commands.js';

describe('createTopoEditCommands', () => {
	it('creates text labels through the document and selection services', () => {
		const topo = { textLabels: [] };
		const selectObject = vi.fn();
		const saveHistory = vi.fn();
		const commands = createTopoEditCommands({
			getTopo: () => topo,
			selection: { selectObject },
			saveHistory
		});

		const id = commands.createTextLabel({ x: 0.2, y: 0.3 });

		expect(topo.textLabels).toHaveLength(1);
		expect(topo.textLabels[0]).toMatchObject({ id, position2D: [0.2, 0.3], text: 'Text' });
		expect(selectObject).toHaveBeenCalledWith('text', id);
		expect(saveHistory).toHaveBeenCalledOnce();
	});

	it('provides a transaction boundary for tool mutations', () => {
		const saveHistory = vi.fn();
		const commands = createTopoEditCommands({ saveHistory });
		const result = commands.commit(() => 'changed');

		expect(result).toBe('changed');
		expect(saveHistory).toHaveBeenCalledOnce();
	});

	it('deletes only matching text labels and updates selection', () => {
		const topo = { textLabels: [{ id: 'a' }, { id: 'b' }] };
		const removeItems = vi.fn();
		const saveHistory = vi.fn();
		const commands = createTopoEditCommands({
			getTopo: () => topo,
			selection: { removeItems },
			saveHistory
		});

		expect(commands.deleteTextLabels(['b'])).toBe(true);
		expect(topo.textLabels.map((label) => label.id)).toEqual(['a']);
		expect(removeItems).toHaveBeenCalledWith([{ type: 'text', id: 'b' }]);
		expect(saveHistory).toHaveBeenCalledOnce();
	});

	it('deletes a symbol and clears its route references', () => {
		const topo = {
			fixPoints: [{ id: 'bolt-1', position2D: [0.2, 0.3] }],
			routes: [{ fixPoints: ['bolt-1'], pitches: [{ startNodeId: 'bolt-1', endNodeId: null }] }]
		};
		const removeItems = vi.fn();
		const commands = createTopoEditCommands({
			getTopo: () => topo,
			selection: { removeItems },
			saveHistory: vi.fn()
		});

		expect(commands.deleteSymbolAt({ x: 0.2, y: 0.3 })).toBe(true);
		expect(topo.fixPoints).toEqual([]);
		expect(topo.routes[0]).toMatchObject({ fixPoints: [], pitches: [{ startNodeId: null }] });
		expect(removeItems).toHaveBeenCalledWith([{ type: 'symbol', id: 'bolt-1' }]);
	});

	it('deletes a mixed selection as one history transaction', () => {
		const topo = {
			routes: [{ id: 'r1' }],
			fixPoints: [{ id: 's1' }],
			outlines: [{ id: 'o1' }],
			textLabels: [{ id: 't1', text: 'label' }]
		};
		const saveHistory = vi.fn();
		const clear = vi.fn();
		const commands = createTopoEditCommands({
			getTopo: () => topo,
			selection: { removeItems: vi.fn(), clear },
			saveHistory
		});

		expect(commands.deleteSelection(new Set(['route:r1', 'symbol:s1', 'outline:o1', 'text:t1']))).toBe(true);
		expect(topo.routes).toEqual([]);
		expect(topo.fixPoints).toEqual([]);
		expect(topo.outlines).toEqual([]);
		expect(topo.textLabels).toEqual([]);
		expect(clear).toHaveBeenCalledOnce();
		expect(saveHistory).toHaveBeenCalledOnce();
	});

	it('moves a route label through the command service', () => {
		const topo = { routes: [{ id: 'r1', points2D: [[0.2, 0.3]] }] };
		const commands = createTopoEditCommands({ getTopo: () => topo });

		expect(commands.moveRouteLabel('r1', {}, { x: 0.4, y: 0.6 })).toBe(true);
		expect(topo.routes[0].labelOffset2D).toEqual([0.2, 0.3]);
	});
});
