// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { getHierarchySourceRefs, loadHierarchyEntries } from './load-crag-editor-entry.ts';

describe('getHierarchySourceRefs', () => {
	it('orders hierarchy sources from the root through the opened entry', () => {
		expect(getHierarchySourceRefs('/austria/tirol/innsbruck/')).toEqual([
			{ path: '', id: 'austria' },
			{ path: 'austria', id: 'tirol' },
			{ path: 'austria/tirol', id: 'innsbruck' }
		]);
	});

	it('keeps missing ancestors as clean, editable entries that can be saved later', async () => {
		const feature = (id, kind) => ({
			type: 'Feature',
			properties: { id, name: id, kind, sectors: [] },
			geometry: { type: 'Point', coordinates: [0, 0] }
		});
		const reader = async (path) => {
			if (path === '/a/a.json') return feature('a', 'country');
			throw new Error('unavailable');
		};

		const entries = await loadHierarchyEntries(
			'a/missing',
			'current',
			feature('current', 'crag'),
			reader
		);

		expect(entries.map((entry) => entry.key)).toEqual(['a', 'a/missing', 'a/missing/current']);
		expect(entries[1]).toMatchObject({
			feature: {
				id: 'missing',
				name: 'missing',
				kind: 'area',
				path: 'a',
				sectors: [{ id: 'current', name: 'current', kind: 'crag' }]
			},
			dirty: false,
			isCurrent: false
		});
		expect(entries.at(-1).isCurrent).toBe(true);
	});
});
