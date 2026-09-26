import { describe, expect, it } from 'vitest';
import {
	createCragEditorSession,
	createFelsEntry,
	snapshotDraftWorkspace,
	snapshotFelsEntryWorkspace
} from './crag-session.svelte.ts';
import { Topo } from '$lib/assets/js/topo-paths.js';
import { saveCragWorkspace } from '$lib/assets/js/save-crag-workspace.js';

function workspace() {
	const root = createFelsEntry('area', { id: 'country', name: 'Country' });
	const crag = createFelsEntry('crag', { id: 'wall', name: 'Wall' });
	return {
		entry: root,
		path: '',
		topo: null,
		access: null,
		dirtyPaths: [],
		sourcePath: 'country',
		removedPaths: [],
		childEntries: [
			{
				entry: crag,
				path: 'country',
				topo: { id: 'wall', routes: [], paths: { type: 'FeatureCollection', features: [] } },
				access: { type: 'FeatureCollection', features: [] },
				dirtyPaths: [],
				sourcePath: 'country/wall',
				removedPaths: [],
				childEntries: []
			}
		]
	};
}

describe('createCragEditorSession workspace state', () => {
	it('stores history as a workspace tree and selection only', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.setCragField('name', 'Edited Wall');
		expect(session.getActiveEntry().properties.name).toBe('Edited Wall');
		expect(session.history.entries[0].after).toEqual(
			expect.objectContaining({
				workspace: expect.anything(),
				activeWorkspaceEntryPath: 'country/wall'
			})
		);
		expect(session.history.entries[0].after).not.toHaveProperty('crag');
		session.undo();
		expect(session.getActiveEntry().properties.name).toBe('Wall');
	});
	it('starts fresh history from the persisted state after saving a rename', async () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.setActiveMetadataTarget('country/wall');
		session.setMetadataField('id', 'new-wall');
		await saveCragWorkspace(session.workspace, {
			rename: async () => {},
			write: async () => {},
			remove: async () => {}
		});
		session.clearHistory();

		expect(session.getActiveWorkspaceEntry().sourcePath).toBe('country/new-wall');
		expect(session.canUndo).toBe(false);
		expect(session.undo()).toBe(false);
		session.setCragField('name', 'Edited after save');
		expect(session.undo()).toBe(true);
		expect(session.getActiveEntry().properties.name).toBe('Wall');
		expect(session.getActiveWorkspaceEntry().sourcePath).toBe('country/new-wall');
	});
	it('keeps pending image binaries out of workspace snapshots', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.workspace.pendingImages = [
			{
				file: { name: 'photo.jpg' },
				previewUrl: 'blob:photo',
				path: 'country/country-image-photo.jpg',
				clientId: 'photo'
			}
		];
		session.workspace.images = [
			{ name: 'country-image-photo.jpg', path: 'country/country-image-photo.jpg' }
		];
		expect(snapshotFelsEntryWorkspace(session.workspace)).not.toHaveProperty('pendingImages');
		expect(snapshotFelsEntryWorkspace(session.workspace).images).toEqual([
			{ name: 'country-image-photo.jpg', path: 'country/country-image-photo.jpg' }
		]);
		session.activeWorkspaceEntryPath = 'country';
		session.setCragField('name', 'Edited Country');
		expect(session.history.entries[0].after.workspace).not.toHaveProperty('pendingImages');
	});
	it('retains a pending upload through undo and redo', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country';
		const node = session.getActiveWorkspaceEntry();
		node.images = [
			{
				name: 'photo.jpg',
				path: 'country/country-image-photo.jpg',
				clientId: 'upload-1'
			}
		];
		session.addPendingImage(node, {
			file: { name: 'photo.jpg', type: 'image/jpeg' },
			previewUrl: 'blob:photo',
			path: node.images[0].path,
			clientId: 'upload-1'
		});
		session.setCragField('name', 'Edited Country');
		session.undo();
		expect(session.getPendingImages(session.getActiveWorkspaceEntry())).toHaveLength(1);
		session.redo();
		expect(session.getPendingImages(session.getActiveWorkspaceEntry())).toHaveLength(1);
	});
	it('keeps image uploads aligned with image history steps', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.setCragField('name', 'Edited Wall');
		const node = session.getActiveWorkspaceEntry();
		const image = { name: 'photo.jpg', path: 'country/wall/photo.jpg', clientId: 'upload-1' };
		const upload = {
			file: { name: 'photo.jpg', type: 'image/jpeg' },
			previewUrl: 'blob:photo',
			path: image.path,
			clientId: image.clientId
		};
		session.commit('Add images', () => {
			node.images = [image];
			session.addPendingImage(node, upload);
		});
		expect(session.history.entries).toHaveLength(2);
		expect(session.undo()).toBe(true);
		expect(session.getActiveEntry().properties.name).toBe('Edited Wall');
		expect(session.getActiveWorkspaceEntry().images || []).toEqual([]);
		expect(session.getPendingImages(session.getActiveWorkspaceEntry())).toEqual([]);
		expect(session.redo()).toBe(true);
		expect(session.getActiveWorkspaceEntry().images).toEqual([image]);
		expect(session.getPendingImages(session.getActiveWorkspaceEntry())).toEqual([upload]);
	});
	it('omits unsaved image descriptors from persisted drafts at every level', () => {
		const tree = workspace();
		tree.images = [{ name: 'root.jpg', path: 'country/root.jpg', clientId: 'pending-root' }];
		tree.childEntries[0].images = [
			{ name: 'pending.jpg', path: 'country/wall/pending.jpg', clientId: 'pending-child' },
			{
				name: 'saved.jpg',
				path: 'country/wall/saved.jpg',
				clientId: 'saved',
				sourcePath: 'country/wall/saved.jpg'
			},
			{ name: 'loaded.jpg', path: 'country/wall/loaded.jpg' }
		];
		const draft = snapshotDraftWorkspace(tree);
		expect(draft.images).toEqual([]);
		expect(draft.childEntries[0].images.map((image) => image.name)).toEqual([
			'saved.jpg',
			'loaded.jpg'
		]);
		expect(tree.images).toHaveLength(1);
		expect(tree.childEntries[0].images).toHaveLength(3);
	});
	it('marks canonical topo and access files on their owner node', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		const node = session.getActiveWorkspaceEntry();
		const paths = new Topo(node.path, node.entry.properties.id);
		session.updateWorkspaceTopo(paths.getTopoPath(), (data) => data.routes.push({ id: 'r1' }));
		session.replaceAccessFeatures([{ id: 'parking' }]);
		expect(node.dirtyPaths).toEqual(
			expect.arrayContaining([paths.getTopoPath(), paths.getAccessPath()])
		);
	});
	it('updates a sector route in its own topo document when its parent is active', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		const crag = session.getActiveWorkspaceEntry();
		const sector = createFelsEntry('sector', { id: 'north', name: 'North' });
		const sectorNode = {
			entry: sector,
			path: 'country/wall',
			topo: { id: 'wall:north', routes: [{ id: 'r1', name: 'Original' }] },
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			childEntries: []
		};
		crag.childEntries.push(sectorNode);
		const sectorTopoPath = new Topo(sectorNode.path, sector.properties.id).getTopoPath();

		session.updateRoute(sectorTopoPath, 'r1', (route) => {
			route.name = 'Updated';
		});

		const updatedSector = session.getWorkspaceEntry('country/wall/north');
		expect(updatedSector.topo.routes[0].name).toBe('Updated');
		expect(updatedSector.dirtyPaths).toContain(sectorTopoPath);
	});
	it('remaps node, active selection, and dirty paths together', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.activeMetadataTarget = 'country/wall';
		const node = session.getActiveWorkspaceEntry();
		node.dirtyPaths.push('country/wall/wall-topo.json');
		session.remapWorkspacePaths('country/wall', 'austria');
		expect(session.activeWorkspaceEntryPath).toBe('austria/wall');
		expect(session.getActiveWorkspaceEntry().path).toBe('austria');
		expect(session.getActiveWorkspaceEntry().dirtyPaths).toContain('austria/wall/wall-topo.json');
	});
	it('reparents only the selected entry and its descendants', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const sibling = createFelsEntry('crag', { id: 'other', name: 'Other' });
		session.workspace.childEntries.push({
			entry: sibling,
			path: 'country',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		});
		session.workspace.childEntries[0].childEntries.push({
			entry: createFelsEntry('sector', { id: 'north', name: 'North' }),
			path: 'country/wall',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		});
		session.activeWorkspaceEntryPath = 'country/wall';
		session.remapWorkspacePaths('country/wall', 'austria');
		expect(session.getWorkspaceEntry('austria/wall')).not.toBeNull();
		expect(session.getWorkspaceEntry('austria/wall/north')).not.toBeNull();
		expect(session.getWorkspaceEntry('country/other')?.path).toBe('country');
		expect(session.undo()).toBe(true);
		expect(session.getWorkspaceEntry('country/wall')).not.toBeNull();
		expect(session.getWorkspaceEntry('country/wall/north')).not.toBeNull();
		expect(session.getWorkspaceEntry('country/other')).not.toBeNull();
	});
	it('moves a child between loaded parents in the workspace tree', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const country = session.workspace;
		const wall = country.childEntries[0];
		const other = {
			entry: createFelsEntry('crag', { id: 'other' }),
			path: 'country',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		};
		const sector = {
			entry: createFelsEntry('sector', { id: 'north' }),
			path: 'country/wall',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		};
		country.childEntries.push(other);
		wall.childEntries.push(sector);
		session.activeWorkspaceEntryPath = 'country/wall/north';
		session.remapWorkspacePaths('country/wall/north', 'country/other');
		expect(session.getWorkspaceEntry('country/wall').childEntries).toHaveLength(0);
		expect(session.getWorkspaceEntry('country/other').childEntries).toHaveLength(1);
		expect(session.getWorkspaceEntry('country/other/north')?.entry.properties.id).toBe('north');
		expect(session.getActiveWorkspaceEntry()?.entry.properties.id).toBe('north');
		session.undo();
		expect(session.getWorkspaceEntry('country/wall/north')).not.toBeNull();
		expect(session.getWorkspaceEntry('country/other/north')).toBeNull();
	});
	it('moves a child into an unloaded folder outside the workspace root', async () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const source = session.getWorkspaceEntry('country/wall');
		const sector = {
			entry: createFelsEntry('sector', { id: 'north' }),
			path: 'country/wall',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			sourcePath: 'country/wall/north',
			removedPaths: [],
			images: []
		};
		source.childEntries.push(sector);
		session.activeWorkspaceEntryPath = 'country/wall/north';
		session.remapWorkspacePaths('country/wall/north', 'austria/cliff');

		expect(session.getWorkspaceEntry('country/wall').childEntries).toHaveLength(0);
		expect(session.getWorkspaceEntry('austria/cliff').childEntries).toHaveLength(1);
		expect(session.getActiveWorkspaceEntry()?.path).toBe('austria/cliff');
		expect(session.hierarchyErrors).toEqual([]);
		expect(session.undo()).toBe(true);
		expect(session.getWorkspaceEntry('country/wall/north')).not.toBeNull();
		expect(session.getWorkspaceEntry('austria/cliff/north')).toBeNull();
		expect(session.redo()).toBe(true);

		const renames = [];
		await saveCragWorkspace(session.workspace, {
			rename: async (from, to) => renames.push([from, to]),
			write: async () => {},
			remove: async () => {}
		});
		expect(renames).toContainEqual(['country/wall/north', 'austria/cliff/north']);
	});
	it('does not move onto a child already loaded at the destination', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const wall = session.getWorkspaceEntry('country/wall');
		const sector = createFelsEntry('sector', { id: 'north' });
		wall.childEntries.push({
			entry: sector,
			path: 'country/wall',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		});
		session.workspace.childEntries.push({
			entry: createFelsEntry('crag', { id: 'other' }),
			path: 'country',
			childEntries: [
				{
					entry: createFelsEntry('sector', { id: 'north' }),
					path: 'country/other',
					childEntries: [],
					topo: null,
					access: null,
					dirtyPaths: [],
					removedPaths: [],
					images: []
				}
			],
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			images: []
		});
		session.remapWorkspacePaths('country/wall/north', 'country/other');
		expect(wall.childEntries).toHaveLength(1);
		expect(session.getWorkspaceEntry('country/other').childEntries).toHaveLength(1);
		expect(session.history.entries).toHaveLength(0);
	});
	it('remaps descendants when moving a root entry into a parent folder', () => {
		const session = createCragEditorSession();
		const root = createFelsEntry('crag', { id: 'new-crag' });
		const sector = createFelsEntry('sector', { id: 'sector' });
		session.workspace = {
			entry: root,
			path: '',
			topo: null,
			access: null,
			dirtyPaths: ['new-crag/new-crag.json'],
			removedPaths: [],
			images: [],
			childEntries: [
				{
					entry: sector,
					path: 'new-crag',
					topo: { id: 'new-crag:sector', routes: [] },
					access: null,
					dirtyPaths: ['new-crag/sector/sector.json', 'new-crag/sector/sector-topo.json'],
					removedPaths: [],
					images: [],
					childEntries: []
				}
			]
		};
		session.activeWorkspaceEntryPath = 'new-crag/sector';

		session.remapWorkspacePaths('new-crag', 'parent');

		const movedSector = session.getWorkspaceEntry('parent/new-crag/sector');
		expect(movedSector?.path).toBe('parent/new-crag');
		expect(movedSector?.dirtyPaths).toEqual(
			expect.arrayContaining([
				'parent/new-crag/sector/sector.json',
				'parent/new-crag/sector/sector-topo.json'
			])
		);
		expect(session.activeWorkspaceEntryPath).toBe('parent/new-crag/sector');
	});
	it('renames an entry while remapping descendants and selection paths', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.activeMetadataTarget = 'country/wall';
		const child = createFelsEntry('sector', { id: 'north' });
		session.createWorkspaceEntry(child);
		session.setMetadataField('id', 'granite-wall');
		expect(session.activeWorkspaceEntryPath).toBe('country/granite-wall');
		expect(session.getActiveSectors()[0].path).toBe('country/granite-wall');
		expect(session.getActiveWorkspaceEntry().dirtyPaths).toContain(
			'country/granite-wall/granite-wall.json'
		);
	});
	it('rejects duplicate sibling IDs during creation and rename', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.createWorkspaceEntry(createFelsEntry('sector', { id: 'north' }));
		expect(session.createWorkspaceEntry(createFelsEntry('sector', { id: 'north' }))).toBeNull();
		expect(session.getActiveSectors()).toHaveLength(1);
		session.createWorkspaceEntry(createFelsEntry('sector', { id: 'south' }));
		session.setMetadataField('id', 'north', 'country/wall/south');
		expect(session.getWorkspaceEntry('country/wall/south')?.entry.properties.id).toBe('south');
		expect(session.identityError?.message).toContain('Duplicate child ID');
		session.setMetadataField('id', 'east', 'country/wall/south');
		expect(session.identityError).toBeNull();
		expect(session.hierarchyErrors).toEqual([]);
	});
	it('blocks unsafe IDs and detects duplicate paths in restored workspaces', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		expect(session.createWorkspaceEntry(createFelsEntry('sector', { id: '../north' }))).toBeNull();
		session.setMetadataField('id', 'north/south');
		expect(session.getActiveEntry().properties.id).toBe('wall');
		const duplicate = createFelsEntry('sector', { id: 'north' });
		session.getActiveWorkspaceEntry().childEntries.push(
			{
				entry: duplicate,
				path: 'country/wall',
				childEntries: [],
				dirtyPaths: [],
				removedPaths: [],
				images: [],
				topo: null,
				access: null
			},
			{
				entry: duplicate,
				path: 'country/wall',
				childEntries: [],
				dirtyPaths: [],
				removedPaths: [],
				images: [],
				topo: null,
				access: null
			}
		);
		expect(session.hierarchyErrors[0].message).toContain('Duplicate child ID');
	});
	it('marks canonical files at their destination after a move', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		session.activeWorkspaceEntryPath = 'country/wall';
		session.remapWorkspacePaths('country/wall', 'austria');
		const node = session.getActiveWorkspaceEntry();
		expect(node.dirtyPaths).toEqual(
			expect.arrayContaining([
				'austria/wall/wall.json',
				'austria/wall/wall-topo.json',
				'austria/wall/wall-access.json'
			])
		);
		expect(node.sourcePath).toBe('country/wall');
	});
	it('relocates discovered image files with their entry', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const node = session.getWorkspaceEntry('country/wall');
		node.images = [
			{ name: 'wall-image-overhang.jpg', path: 'country/wall/wall-image-overhang.jpg' }
		];
		session.remapWorkspacePaths('country/wall', 'austria');
		expect(node.images[0]).toMatchObject({
			sourcePath: 'country/wall/wall-image-overhang.jpg',
			path: 'austria/wall/wall-image-overhang.jpg'
		});
	});
	it('relocates a discovered GLB model with its entry', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const node = session.getWorkspaceEntry('country/wall');
		node.modelPath = 'country/wall/wall.glb';
		session.remapWorkspacePaths('country/wall', 'austria');
		expect(node.modelPath).toBe('austria/wall/wall.glb');
		expect(node.modelSourcePath).toBe('country/wall/wall.glb');
	});
	it('relocates topo backgrounds and other auxiliary files with their entry', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const node = session.getWorkspaceEntry('country/wall');
		node.auxiliaryFiles = ['country/wall/topo.jpg', 'country/wall/route-notes.pdf'];
		session.remapWorkspacePaths('country/wall', 'austria');
		expect(node.auxiliaryFiles).toEqual(['austria/wall/topo.jpg', 'austria/wall/route-notes.pdf']);
	});
	it('collects persisted directories from all descendants when removing an entry', () => {
		const session = createCragEditorSession();
		session.workspace = workspace();
		const wall = session.getWorkspaceEntry('country/wall');
		const sector = createFelsEntry('sector', { id: 'north', name: 'North' });
		wall.childEntries.push({
			entry: sector,
			path: 'country/wall',
			topo: { id: 'north', routes: [] },
			access: { type: 'FeatureCollection', features: [] },
			dirtyPaths: [],
			sourcePath: 'country/wall/north',
			removedPaths: [],
			images: [{ name: 'north-image.jpg', path: 'country/wall/north/north-image.jpg' }],
			modelPath: 'country/wall/north/north.glb',
			auxiliaryFiles: ['country/wall/north/topo.jpg'],
			childEntries: []
		});

		expect(session.removeWorkspaceEntry('country/wall')).toBe(true);
		expect(session.workspace.removedDirectories).toEqual(
			expect.arrayContaining(['country/wall', 'country/wall/north'])
		);
	});
	it('materializes a path-only hierarchy node as a dirty entry', () => {
		const session = createCragEditorSession();
		session.workspace = {
			entry: null,
			id: 'missing',
			path: '',
			topo: null,
			access: null,
			dirtyPaths: [],
			removedPaths: [],
			childEntries: []
		};
		const entry = session.materializeWorkspaceEntry('missing');
		expect(entry?.properties).toMatchObject({ id: 'missing', name: 'missing', kind: 'area' });
		expect(session.getWorkspaceEntry('missing').dirtyPaths).toContain('/missing/missing.json');
	});
});
