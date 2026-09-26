// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
	getHierarchySourceRefs,
	loadCragEditorEntry,
	loadFelsEntryWorkspace,
	loadFelsEntryWorkspaceDetails
} from './load-crag-editor-entry.ts';

describe('getHierarchySourceRefs', () => {
	it('keeps details retryable after a listing failure', async () => {
		const feature = {
			type: 'Feature',
			properties: { id: 'wall', kind: 'crag' },
			geometry: null
		};
		const reader = async (path) => {
			if (path.endsWith('/wall.json')) return feature;
			throw Error(`Failed to read ${path}: 404 Not Found`);
		};
		let attempts = 0;
		const list = async () => {
			if (++attempts === 1) throw Error('listing unavailable');
			return [];
		};
		await expect(loadCragEditorEntry('wall', reader, list)).rejects.toThrow('listing unavailable');
		const workspace = await loadFelsEntryWorkspace('wall', reader, list);
		await loadFelsEntryWorkspaceDetails(workspace, 'wall', reader, list);
		expect(workspace.detailsLoaded).toBe(true);
		expect(attempts).toBe(2);
	});
	it('orders hierarchy sources from the root through the opened entry', () => {
		expect(getHierarchySourceRefs('/austria/tirol/innsbruck/')).toEqual([
			{ path: '', id: 'austria' },
			{ path: 'austria', id: 'tirol' },
			{ path: 'austria/tirol', id: 'innsbruck' }
		]);
	});

	it('keeps existing asset references when loading an entry', async () => {
		const assets = { images: ['wall/image.jpg'], models: ['wall/wall.glb'] };
		const entry = {
			type: 'Feature',
			properties: { id: 'wall', kind: 'crag', assets, sectors: [] },
			geometry: null
		};
		const workspace = await loadFelsEntryWorkspace('wall', async () => entry);
		expect(workspace.entry.properties.assets).toEqual(assets);
		expect(workspace.entry.properties).not.toHaveProperty('sectors');
	});
	it('retains a moved child when loading its destination parent', async () => {
		const feature = {
			type: 'Feature',
			properties: { id: 'wall', kind: 'crag' },
			geometry: null
		};
		const reader = async (path) => {
			if (path.endsWith('/wall.json')) return feature;
			throw Error(`Failed to read ${path}: 404 Not Found`);
		};
		const workspace = await loadFelsEntryWorkspace('wall', reader);
		workspace.childEntries.push({
			entry: { ...feature, properties: { id: 'north', kind: 'sector' } },
			path: 'wall',
			sourcePath: 'old/north',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		});
		await loadFelsEntryWorkspaceDetails(workspace, 'wall', reader, async () => []);
		expect(workspace.childEntries.map((child) => child.entry?.properties.id)).toEqual(['north']);
	});

	it('loads only the opened feature initially, then loads selected documents and direct children', async () => {
		const files = {
			'a/b/b.json': {
				type: 'Feature',
				properties: { id: 'b', kind: 'crag' },
				geometry: { type: 'Point', coordinates: [0, 0] }
			},
			'a/b/b-topo.json': { id: 'b', routes: [] },
			'a/b/b-access.json': { type: 'FeatureCollection', features: [] },
			'a/b/child/child.json': {
				type: 'Feature',
				properties: { id: 'child', kind: 'sector' },
				geometry: { type: 'Point', coordinates: [0, 0] }
			},
			'a/b/child/child-topo.json': { id: 'child', routes: [] }
		};
		const reader = async (path) => {
			if (!(path in files)) throw new Error(`Failed to read ${path}: 404 Not Found`);
			return files[path];
		};
		const directoryReader = async (path) =>
			path === 'a/b' ? [{ name: 'child', type: 'dir' }] : [{ name: 'grandchild', type: 'dir' }];
		const root = await loadFelsEntryWorkspace('a/b', reader, directoryReader);
		expect(root.entry).toBeNull();
		const opened = root.childEntries[0];
		expect(opened.entry?.properties.id).toBe('b');
		expect(opened.topo).toBeNull();
		expect(opened.access).toBeNull();
		expect(opened.childEntries).toEqual([]);
		await loadFelsEntryWorkspaceDetails(root, 'a/b', reader, directoryReader);
		expect(opened.topo).toMatchObject({ id: 'b' });
		expect(opened.access).toMatchObject({ type: 'FeatureCollection' });
		expect(opened.childEntries[0].entry?.properties.id).toBe('child');
		expect(opened.childEntries[0].topo).toMatchObject({ id: 'child' });
	});

	it('loads the active entry documents before returning an editor session', async () => {
		const files = {
			'/wall/wall.json': {
				type: 'Feature',
				properties: { id: 'wall', kind: 'crag' },
				geometry: { type: 'Point', coordinates: [0, 0] }
			},
			'/wall/wall-topo.json': { id: 'wall', routes: [{ id: 'existing-route' }] },
			'/wall/wall-access.json': {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						geometry: { type: 'Point', coordinates: [0, 0] },
						properties: { kind: 'parking' }
					}
				]
			}
		};
		const reader = async (path) => {
			if (!(path in files)) throw new Error(`Failed to read ${path}: 404 Not Found`);
			return files[path];
		};
		const session = await loadCragEditorEntry('wall', reader, async () => [
			{ name: 'wall-image-overhang.jpg', path: 'wall/wall-image-overhang.jpg', type: 'file' },
			{ name: 'wall.glb', path: 'wall/wall.glb', type: 'file' },
			{ name: 'topo.jpg', path: 'wall/topo.jpg', type: 'file' },
			{ name: 'route-notes.pdf', path: 'wall/route-notes.pdf', type: 'file' }
		]);
		expect(session?.workspace?.topo).toMatchObject({ routes: [{ id: 'existing-route' }] });
		expect(session?.workspace?.access).toMatchObject({
			version: 1,
			features: [expect.objectContaining({ properties: { kind: 'parking' } })]
		});
		expect(session?.workspace?.access?.features[0].id).toMatch(/^parking-/);
		expect(session?.workspace?.images).toEqual([
			{ name: 'wall-image-overhang.jpg', path: 'wall/wall-image-overhang.jpg' }
		]);
		expect(session?.workspace?.modelPath).toBe('wall/wall.glb');
		expect(session?.workspace?.auxiliaryFiles).toEqual(['wall/topo.jpg', 'wall/route-notes.pdf']);
	});

	it('resolves bare directory listing names relative to the entry folder', async () => {
		const files = {
			'/wall/wall.json': {
				type: 'Feature',
				properties: { id: 'wall', kind: 'crag' },
				geometry: null
			}
		};
		const reader = async (path) => {
			if (!(path in files)) throw new Error(`Failed to read ${path}: 404 Not Found`);
			return files[path];
		};

		const session = await loadCragEditorEntry('wall', reader, async () => [
			{ name: 'wall-image-sunset.jpg', path: 'wall-image-sunset.jpg', type: 'file' }
		]);

		expect(session?.workspace?.images).toEqual([
			{ name: 'wall-image-sunset.jpg', path: 'wall/wall-image-sunset.jpg' }
		]);
	});

	it('repairs an empty child entry file as a visible, saveable entry', async () => {
		const files = {
			'/wall/wall.json': {
				type: 'Feature',
				properties: { id: 'wall', kind: 'crag' },
				geometry: null
			}
		};
		const reader = async (path) => {
			if (path === 'wall/north/north.json') throw new SyntaxError('Unexpected end of JSON input');
			if (!(path in files)) throw new Error(`Failed to read ${path}: 404 Not Found`);
			return files[path];
		};

		const session = await loadCragEditorEntry('wall', reader, async (path) =>
			path === 'wall' ? [{ name: 'north', type: 'dir' }] : []
		);

		expect(session?.workspace?.childEntries[0]).toMatchObject({
			entry: { properties: { id: 'north', name: 'north', kind: 'area' } },
			sourcePath: 'wall/north',
			dirtyPaths: ['wall/north/north.json']
		});
	});

	it('does not replace child metadata when its read fails for another reason', async () => {
		const reader = async (path) => {
			if (path === '/wall/wall.json')
				return {
					type: 'Feature',
					properties: { id: 'wall', kind: 'crag' },
					geometry: null
				};
			if (path === 'wall/north/north.json')
				throw Error('Failed to read wall/north/north.json: 503 Service Unavailable');
			throw Error('Failed to read optional file: 404 Not Found');
		};
		await expect(
			loadCragEditorEntry('wall', reader, async () => [{ name: 'north', type: 'dir' }])
		).rejects.toThrow('503 Service Unavailable');
	});

	it('does not treat a failed optional topo read as an absent document', async () => {
		const reader = async (path) => {
			if (path === '/wall/wall.json')
				return {
					type: 'Feature',
					properties: { id: 'wall', kind: 'crag' },
					geometry: null
				};
			if (path === '/wall/wall-topo.json')
				throw Error('Failed to read wall/wall-topo.json: 503 Service Unavailable');
			throw Error(`Failed to read ${path}: 404 Not Found`);
		};
		await expect(loadCragEditorEntry('wall', reader, async () => [])).rejects.toThrow(
			'503 Service Unavailable'
		);
	});

	it('keeps loaded descendants and documents when navigating within a workspace', async () => {
		const files = {
			'/wall/wall-topo.json': { id: 'wall', routes: [{ id: 'server-route' }] },
			'/wall/wall-access.json': { type: 'FeatureCollection', features: [{ id: 'server-access' }] },
			'wall/sector/sector-topo.json': { id: 'wall:sector', routes: [{ id: 'server-route' }] },
			'wall/sector/sector-access.json': {
				type: 'FeatureCollection',
				features: [{ id: 'server-access' }]
			}
		};
		const reader = async (path) => {
			if (!(path in files)) throw new Error(`Failed to read ${path}: 404 Not Found`);
			return files[path];
		};
		const workspace = {
			entry: {
				type: 'Feature',
				properties: { id: 'wall', kind: 'crag' },
				geometry: { type: 'Point', coordinates: [0, 0] }
			},
			id: 'wall',
			path: '',
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: [],
			pendingImages: [],
			detailsLoaded: false,
			childEntries: [
				{
					entry: {
						type: 'Feature',
						properties: { id: 'sector', kind: 'sector' },
						geometry: { type: 'Point', coordinates: [0, 0] }
					},
					id: 'sector',
					path: 'wall',
					sourcePath: 'wall/sector',
					topo: { id: 'wall:sector', routes: [{ id: 'pending-route' }] },
					access: null,
					dirtyPaths: ['wall/sector/sector-topo.json'],
					removedPaths: [],
					images: [],
					pendingImages: [],
					childEntries: []
				}
			]
		};

		await loadFelsEntryWorkspaceDetails(workspace, 'wall', reader, async () => [
			{ name: 'sector', type: 'dir' }
		]);

		expect(workspace.childEntries[0].topo.routes).toEqual([{ id: 'pending-route' }]);
		expect(workspace.childEntries[0].dirtyPaths).toEqual(['wall/sector/sector-topo.json']);
		await loadFelsEntryWorkspaceDetails(workspace, 'wall/sector', reader, async () => []);
		expect(workspace.childEntries[0].topo.routes).toEqual([{ id: 'pending-route' }]);

		workspace.topo.routes = [{ id: 'edited-route' }];
		workspace.access.features = [{ id: 'edited-access' }];
		workspace.dirtyPaths.push('wall/wall-topo.json', 'wall/wall-access.json');
		await loadFelsEntryWorkspaceDetails(workspace, 'wall', reader, async () => []);

		expect(workspace.topo.routes).toEqual([{ id: 'edited-route' }]);
		expect(workspace.access.features).toEqual([{ id: 'edited-access' }]);
	});
});
