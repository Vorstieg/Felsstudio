import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	topoStore: {
		set: vi.fn(),
		get: vi.fn(),
		delete: vi.fn()
	}
}));

vi.mock('$lib/assets/js/db.js', () => ({ topoStore: mocks.topoStore }));

import { draftsState, isBlankTopoSession } from './drafts.svelte.js';

if (!globalThis.localStorage) {
	let values = new Map();
	globalThis.localStorage = {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, String(value)),
		removeItem: (key) => values.delete(key),
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		}
	};
}

describe('draft persistence', () => {
	beforeEach(() => {
		localStorage.clear();
		draftsState.drafts = [];
		mocks.topoStore.set.mockReset().mockResolvedValue(undefined);
		mocks.topoStore.get.mockReset().mockResolvedValue(null);
		mocks.topoStore.delete.mockReset().mockResolvedValue(undefined);
	});

	it('saves the full session and lightweight metadata separately', async () => {
		const topo = {
			id: 'topo-1',
			editorMode: '2d',
			name: 'Rote Wand',
			_entryPath: '/lower-austria/rote-wand/rote-wand/',
			_topoFileName: 'lower-austria/rote-wand/rote-wand-topo.json',
			routes: [{ id: 'route-1', name: 'Direkter Einstieg' }]
		};

		const draftId = await draftsState.save(topo, null, { selectedRouteId: 'route-1' });

		expect(draftId).toBe('2d-topo-1');
		expect(mocks.topoStore.set).toHaveBeenCalledOnce();
		expect(mocks.topoStore.set).toHaveBeenCalledWith(
			expect.objectContaining({
				id: '2d-topo-1',
				topo,
				selectedRouteId: 'route-1'
			})
		);
		expect(JSON.parse(localStorage.getItem('topo_drafts_v1'))).toEqual([
			expect.objectContaining({
				id: '2d-topo-1',
				name: 'Rote Wand',
				editorMode: '2d',
				sourceEntryPath: 'lower-austria/rote-wand/rote-wand',
				sourceTopoFileName: 'lower-austria/rote-wand/rote-wand-topo.json'
			})
		]);
		expect(
			Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
		).toEqual(['topo_drafts_v1']);

		topo.routes[0].name = 'Changed after save';
		expect(mocks.topoStore.set.mock.calls[0][0].topo.routes[0].name).toBe('Direkter Einstieg');
	});

	it('converts GLB blobs to restorable array buffers', async () => {
		const blob = Object.assign(new Blob(['glb-data'], { type: 'model/gltf-binary' }), {
			arrayBuffer: async () => new TextEncoder().encode('glb-data').buffer
		});
		await draftsState.save({ editorMode: '3d', name: 'Model' }, 'draft-3d', { glbBlob: blob });

		const saved = mocks.topoStore.set.mock.calls[0][0];
		expect(saved.glbBlob).toBeUndefined();
		expect(saved.glbArrayBuffer.byteLength).toBeGreaterThan(0);
		expect(new TextDecoder().decode(new Uint8Array(saved.glbArrayBuffer))).toBe('glb-data');
	});

	it('finds the latest non-blank draft for the requested editor mode', async () => {
		draftsState.drafts = [
			{ id: 'blank', editorMode: '2d', updated: '2026-01-03T00:00:00.000Z' },
			{ id: 'three-d', editorMode: '3d', updated: '2026-01-02T00:00:00.000Z' },
			{ id: 'two-d', editorMode: '2d', updated: '2026-01-01T00:00:00.000Z' }
		];
		const sessions = {
			blank: { topo: { editorMode: '2d', routes: [] } },
			'three-d': { topo: { editorMode: '3d', name: '3D wall' } },
			'two-d': { topo: { editorMode: '2d', name: '2D wall' } }
		};
		vi.spyOn(draftsState, 'getById').mockImplementation(async (id) => sessions[id] || null);

		const result = await draftsState.getLatest('2d');

		expect(result).toEqual({
			id: 'two-d',
			session: sessions['two-d'],
			metadata: draftsState.drafts[2]
		});
		draftsState.getById.mockRestore();
	});

	it('finds the latest matching non-blank draft for a source entry path', async () => {
		draftsState.drafts = [
			{
				id: 'matching-newer',
				editorMode: '2d',
				updated: '2026-01-03T00:00:00.000Z',
				sourceEntryPath: 'lower-austria/rote-wand/rote-wand'
			},
			{
				id: 'other-source',
				editorMode: '2d',
				updated: '2026-01-04T00:00:00.000Z',
				sourceEntryPath: 'lower-austria/other/other'
			},
			{
				id: 'matching-blank',
				editorMode: '2d',
				updated: '2026-01-05T00:00:00.000Z',
				sourceEntryPath: 'lower-austria/rote-wand/rote-wand'
			}
		];
		const sessions = {
			'matching-newer': {
				topo: {
					editorMode: '2d',
					name: 'Rote Wand draft',
					_entryPath: 'lower-austria/rote-wand/rote-wand'
				}
			},
			'other-source': {
				topo: { editorMode: '2d', name: 'Other', _entryPath: 'lower-austria/other/other' }
			},
			'matching-blank': {
				topo: { editorMode: '2d', _entryPath: 'lower-austria/rote-wand/rote-wand', routes: [] }
			}
		};
		vi.spyOn(draftsState, 'getById').mockImplementation(async (id) => sessions[id] || null);

		const result = await draftsState.getLatestForSource(
			'2d',
			'/lower-austria/rote-wand/rote-wand/'
		);

		expect(result).toEqual({
			id: 'matching-newer',
			session: sessions['matching-newer'],
			metadata: draftsState.drafts[0]
		});
		draftsState.getById.mockRestore();
	});

	it('removes draft metadata and the stored session when deleting a draft', async () => {
		draftsState.drafts = [{ id: '2d-topo-1', name: 'Rote Wand', editorMode: '2d' }];
		localStorage.setItem('topo_drafts_v1', JSON.stringify(draftsState.drafts));
		await draftsState.delete('2d-topo-1');

		expect(draftsState.drafts).toEqual([]);
		expect(mocks.topoStore.delete).toHaveBeenCalledWith('2d-topo-1');
		expect(mocks.topoStore.get).not.toHaveBeenCalled();
	});
});

describe('isBlankTopoSession', () => {
	it('recognizes empty sessions and meaningful content', () => {
		expect(isBlankTopoSession({ topo: { routes: [], fixPoints: [] } })).toBe(true);
		expect(isBlankTopoSession({ topo: { routes: [{ id: 'route-1' }] } })).toBe(false);
		expect(isBlankTopoSession({ topo: {}, glbArrayBuffer: new ArrayBuffer(0) })).toBe(false);
	});
});
