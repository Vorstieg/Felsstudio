import { describe, expect, it } from 'vitest';
import { resolveTopoSavePath } from './topo-save-path.ts';

describe('resolveTopoSavePath', () => {
	it('preserves the draft destination over the current route', () => {
		expect(resolveTopoSavePath({ topoFileName: 'original/original-topo.json' }, 'area/crag')).toBe(
			'original/original-topo.json'
		);
	});

	it('recovers from a draft file stem without duplicating the crag ID', () => {
		expect(resolveTopoSavePath({ entryPath: 'area/crag/crag' }, 'other/crag')).toBe(
			'area/crag/crag-topo.json'
		);
	});

	it('recovers from the crag route when applying JSON erased the metadata', () => {
		expect(resolveTopoSavePath({}, '/area/crag/')).toBe('area/crag/crag-topo.json');
	});

	it('does not invent a destination for a local draft', () => {
		expect(resolveTopoSavePath({})).toBeNull();
	});
});
