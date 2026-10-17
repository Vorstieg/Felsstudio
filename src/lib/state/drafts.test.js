// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/paths', () => ({ base: '' }));
const database = vi.hoisted(() => ({ records: new Map(), fail: false }));
vi.mock('$lib/assets/js/db', () => ({
	draftStore: {
		get: vi.fn(async (id) => database.records.get(id) || null),
		list: vi.fn(async () => [...database.records.values()]),
		set: vi.fn(async (draft) => {
			if (database.fail) throw new Error('Storage full');
			database.records.set(draft.id, draft);
		}),
		delete: vi.fn(async (id) => database.records.delete(id))
	}
}));
import { draftsState } from './drafts.svelte';
import { createDraft, draftNode, createDraftResources, workspaceNodes } from './shared-draft';
import { createCragEditorSession } from './crag-session.svelte';
import { createTopo2DEditorState } from './topo-2d-editor-state.svelte';
import { cragDraftAdapter, topoDraftAdapter } from '$lib/components/editor/use-draft-editor.svelte';

const restore = async (id) => createDraftResources().restore(await draftsState.get(id));
beforeEach(() => {
	database.records.clear();
	database.fail = false;
	draftsState.drafts = [];
});

describe('whole-draft persistence and editor adapters', () => {
	it('replaces crag history and upload caches when reloading a published reviewer snapshot', () => {
		const editor = createCragEditorSession();
		const adapter = cragDraftAdapter(editor);
		const draft = createDraft('crag');
		const node = draftNode(draft);
		node.pendingImages = [
			{
				clientId: 'photo',
				path: 'new-crag/photo.jpg',
				file: new File(['photo'], 'photo.jpg'),
				previewUrl: 'blob:old-preview'
			}
		];
		node.images = [{ clientId: 'photo', name: 'photo.jpg', path: 'new-crag/photo.jpg' }];
		adapter.load(draft);
		editor.setCragField('name', 'Correction');
		expect(editor.canUndo).toBe(true);
		expect(editor.getPendingImages(node)).toHaveLength(1);
		const published = structuredClone(draft);
		published.workspace.pendingImages = [];
		adapter.load(published);
		expect(editor.canUndo).toBe(false);
		expect(editor.getPendingImages(published.workspace)).toEqual([]);
	});
	it('retains crag metadata, access, unknown fields, and 3D geometry through a 2D edit', async () => {
		const draft = createDraft('crag');
		const node = draftNode(draft);
		node.topo = { routes: [{ id: 'r1', points3D: [[1, 2, 3]] }], custom: { retained: true } };
		node.access = { type: 'FeatureCollection', features: [{ id: 'parking' }] };
		const editor = createTopo2DEditorState();
		const adapter = topoDraftAdapter(editor, '2d');
		await adapter.load(draft);
		editor.topo.routes[0].name = 'Edited in 2D';
		adapter.capture(draft);
		await draftsState.save(draft);
		const loaded = await restore(draft.id);
		expect(loaded.workspace.entry.properties.name).toBe('New Crag');
		expect(loaded.workspace.access.features).toEqual([{ id: 'parking' }]);
		expect(loaded.workspace.topo).toMatchObject({
			custom: { retained: true },
			routes: [{ id: 'r1', name: 'Edited in 2D', points3D: [[1, 2, 3]] }]
		});
		expect(loaded).not.toHaveProperty('documents');
	});
	it('keeps models and clustering outside crag history, preserving them through undo and save', async () => {
		const draft = createDraft('3d');
		draft.contexts[draft.activeNodeId] = {
			glbBlob: new Blob(['model']),
			modelScale: [2, 2, 2],
			clustering: { rawHits: [{ id: 'hit' }], cropsMap: {} }
		};
		const crag = createCragEditorSession();
		const adapter = cragDraftAdapter(crag);
		adapter.load(draft);
		crag.setCragField('name', 'Changed');
		crag.undo();
		adapter.capture(draft);
		await draftsState.save(draft);
		const loaded = await restore(draft.id);
		expect(await loaded.contexts[draft.activeNodeId].glbBlob.text()).toBe('model');
		expect(loaded.contexts[draft.activeNodeId].modelScale).toEqual([2, 2, 2]);
		expect(loaded.contexts[draft.activeNodeId].clustering.rawHits).toEqual([{ id: 'hit' }]);
		expect(loaded.workspace.entry.properties.name).toBe('New Crag');
	});
	it('retains pending image data across restoration, crag undo, and another save', async () => {
		const draft = createDraft('crag');
		const node = draftNode(draft);
		node.images = [{ name: 'image.png', path: 'new-crag/image.png', clientId: 'image' }];
		node.pendingImages = [
			{
				file: new File(['image'], 'image.png', { type: 'image/png' }),
				previewUrl: 'blob:transient',
				path: 'new-crag/image.png',
				clientId: 'image'
			}
		];
		await draftsState.save(draft);
		const loaded = await restore(draft.id);
		const crag = createCragEditorSession();
		const adapter = cragDraftAdapter(crag);
		adapter.load(loaded);
		crag.setCragField('name', 'Edit');
		crag.undo();
		adapter.capture(loaded);
		await draftsState.save(loaded);
		expect(await (await restore(draft.id)).workspace.pendingImages[0].file.text()).toBe('image');
		expect(node.pendingImages[0].previewUrl).toBe('blob:transient');
	});
	it('preserves node identity and pending operations through renaming', async () => {
		const draft = createDraft('crag');
		const crag = createCragEditorSession();
		const adapter = cragDraftAdapter(crag);
		adapter.load(draft);
		const original = draft.activeNodeId;
		crag.setMetadataField('id', 'renamed');
		crag.workspace.removedPaths = ['old.json'];
		crag.workspace.removedDirectories = ['old-directory'];
		adapter.capture(draft);
		await draftsState.save(draft);
		const loaded = await restore(draft.id);
		expect(loaded.activeNodeId).toBe(original);
		expect(loaded.workspace.entry.properties.id).toBe('renamed');
		expect(loaded.workspace.removedPaths).toEqual(['old.json']);
		expect(loaded.workspace.removedDirectories).toEqual(['old-directory']);
	});
	it('keeps sibling topos independent and prunes removed nodes only from persisted snapshots', async () => {
		const draft = createDraft('crag');
		const crag = createCragEditorSession();
		const adapter = cragDraftAdapter(crag);
		adapter.load(draft);
		const child = crag.createWorkspaceEntry({
			type: 'Feature',
			properties: { id: 'sector', name: 'Sector', kind: 'sector' },
			geometry: null
		});
		const id = child.clientId;
		expect(id).toBeTruthy();
		child.topo = { routes: [{ id: 'child' }] };
		draft.workspace.topo = { routes: [{ id: 'root' }] };
		draft.contexts[id] = { glbBlob: new Blob(['child-model']) };
		adapter.capture(draft);
		await draftsState.save(draft);
		expect(
			workspaceNodes((await restore(draft.id)).workspace).map((node) => node.topo.routes[0].id)
		).toEqual(['root', 'child']);
		crag.removeWorkspaceEntry('new-crag/sector');
		adapter.capture(draft);
		await draftsState.save(draft);
		expect((await draftsState.get(draft.id)).contexts[id]).toBeUndefined();
		expect(draft.contexts[id]).toBeDefined();
		crag.undo();
		adapter.capture(draft);
		await draftsState.save(draft);
		expect(await (await restore(draft.id)).contexts[id].glbBlob.text()).toBe('child-model');
	});
	it('orders saves and snapshots data before later edits', async () => {
		const draft = createDraft('2d');
		draft.workspace.topo = { routes: [{ id: 'first' }] };
		const first = draftsState.save(draft);
		draft.workspace.topo.routes[0].id = 'second';
		const second = draftsState.save(draft);
		draft.workspace.topo.routes[0].id = 'not-saved';
		await Promise.all([first, second]);
		expect((await restore(draft.id)).workspace.topo.routes[0].id).toBe('second');
	});
	it('does not publish metadata or damage another draft after a failed commit', async () => {
		const first = createDraft('2d');
		const second = createDraft('crag');
		await draftsState.save(first);
		await draftsState.save(second);
		const metadata = [...draftsState.drafts];
		database.fail = true;
		first.name = 'Not committed';
		await expect(draftsState.save(first)).rejects.toThrow('Storage full');
		expect(draftsState.drafts).toEqual(metadata);
		expect((await draftsState.get(first.id)).name).not.toBe('Not committed');
		database.fail = false;
		await draftsState.delete(first.id);
		expect(await draftsState.get(first.id)).toBeNull();
		expect(await draftsState.get(second.id)).toBeTruthy();
	});
});
