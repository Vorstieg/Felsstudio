import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listDir: vi.fn(), readJson: vi.fn() }));
vi.mock('$lib/api/felslager.ts', () => api);

import fetchCrags from './fetchCrags.ts';

describe('fetchCrags', () => {
	beforeEach(() => {
		api.listDir.mockReset();
		api.readJson.mockReset();
	});

	it('lists entry files at every hierarchy level, excludes auxiliary files, and sorts newest first', async () => {
		api.listDir.mockResolvedValue([
			{ type: 'file', name: 'old.json', path: 'old.json' },
			{ type: 'file', name: 'new.json', path: 'new/new.json' },
			{ type: 'file', name: 'sector-1.json', path: 'new/sector-1/sector-1.json' },
			{ type: 'file', name: 'new-topo.json', path: 'new/new-topo.json' },
			{ type: 'file', name: 'new-parking.json', path: 'new/new-parking.json' },
			{ type: 'file', name: 'new-access.json', path: 'new/new-access.json' },
			{ type: 'dir', name: 'ignored', path: 'ignored' }
		]);
		api.readJson.mockImplementation(async (path) => ({
			properties: {
				name: path,
				kind: path.includes('sector-1') ? 'sector' : 'crag',
				date: path === 'new/new.json' ? '2026-01-02' : '2025-01-01'
			},
			...(path === 'old.json' ? {} : {})
		}));

		const result = await fetchCrags({ limit: -1 });
		expect(result.map((crag) => crag.properties.id)).toEqual(['new', 'old', 'sector-1']);
		expect(result.map((crag) => crag.entryPath)).toEqual(['new', 'old', 'new/sector-1']);
		expect(result.every((crag) => crag.properties.path === undefined)).toBe(true);
		expect(api.listDir).toHaveBeenCalledWith('', { recursive: true });
	});

	it('searches entry names, paths, and types, then paginates', async () => {
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
		await expect(fetchCrags({ search: 'south', limit: -1 })).resolves.toHaveLength(1);
		await expect(fetchCrags({ search: 'face', limit: -1 })).resolves.toHaveLength(0);
		await expect(fetchCrags({ offset: 1, limit: 1 })).resolves.toHaveLength(1);
	});

	it('ignores malformed files and falls back to an empty access collection', async () => {
		api.listDir.mockResolvedValue([{ type: 'file', name: 'broken.json', path: 'broken.json' }]);
		const error = new Error('invalid JSON');
		const logWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		api.readJson.mockRejectedValue(error);
		await expect(fetchCrags({ limit: -1 })).resolves.toEqual([]);
		expect(logWarning).toHaveBeenCalledWith('Failed to load crag entry:', 'broken.json', error);
	});
});
