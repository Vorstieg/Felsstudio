import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listDir: vi.fn(), readJson: vi.fn() }));
vi.mock('$lib/api/felslager.js', () => api);

import fetchCrags, { loadAccessCollection } from './fetchCrags.js';

describe('fetchCrags', () => {
	beforeEach(() => {
		api.listDir.mockReset();
		api.readJson.mockReset();
	});

	it('filters entry files, excludes sectors and auxiliary files, and sorts newest first', async () => {
		api.listDir.mockResolvedValue([
			{ type: 'file', name: 'old.json', path: 'old.json' },
			{ type: 'file', name: 'new.json', path: 'new.json' },
			{ type: 'file', name: 'new-topo.json', path: 'new-topo.json' },
			{ type: 'file', name: 'new-parking.json', path: 'new-parking.json' },
			{ type: 'dir', name: 'ignored', path: 'ignored' }
		]);
		api.readJson.mockImplementation(async (path) => ({
			properties: { name: path, date: path === 'new.json' ? '2026-01-02' : '2025-01-01' },
			...(path === 'old.json' ? {} : {})
		}));

		const result = await fetchCrags({ limit: -1 });
		expect(result.map((crag) => crag.properties.id)).toEqual(['new', 'old']);
		expect(api.listDir).toHaveBeenCalledWith('', { recursive: true });
	});

	it('searches names, paths, types, and sector metadata, then paginates', async () => {
		api.listDir.mockResolvedValue([
			{ type: 'file', name: 'alpha.json', path: 'north/alpha.json' },
			{ type: 'file', name: 'beta.json', path: 'south/beta.json' }
		]);
		api.readJson.mockImplementation(async (path) =>
			path.includes('alpha')
				? {
						properties: {
							name: 'Granite',
							date: '2026-01-01',
							type: ['sport'],
							sectors: [{ name: 'North Face' }]
						}
					}
				: { properties: { name: 'Other', date: '2025-01-01', type: ['alpine'] } }
		);

		await expect(fetchCrags({ search: 'north', limit: -1 })).resolves.toHaveLength(1);
		await expect(fetchCrags({ search: 'face', limit: -1 })).resolves.toHaveLength(1);
		await expect(fetchCrags({ offset: 1, limit: 1 })).resolves.toHaveLength(1);
	});

	it('ignores malformed files and falls back to an empty access collection', async () => {
		api.listDir.mockResolvedValue([{ type: 'file', name: 'broken.json', path: 'broken.json' }]);
		const error = new Error('invalid JSON');
		const logWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		api.readJson.mockRejectedValue(error);
		await expect(fetchCrags({ limit: -1 })).resolves.toEqual([]);
		expect(logWarning).toHaveBeenCalledWith('Failed to load crag entry:', 'broken.json', error);

		const state = { access: null };
		const topo = { getAccessPath: () => 'access.json' };
		await loadAccessCollection(topo, state);
		expect(state.access).toEqual({ type: 'FeatureCollection', version: 1, features: [] });
	});
});
