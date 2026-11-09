// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/paths', () => ({ base: '' }));
const api = vi.hoisted(() => ({ getProcessingResults: vi.fn(), downloadResultFile: vi.fn() }));
vi.mock('$lib/api/processing', () => api);
const database = vi.hoisted(() => ({ records: new Map() }));
vi.mock('$lib/assets/js/db', () => ({
	draftStore: {
		get: async (id) => database.records.get(id),
		set: async (draft) => {
			database.records.set(draft.id, draft);
		},
		list: async () => [...database.records.values()],
		delete: vi.fn()
	}
}));
vi.mock('./gltf-loader', () => ({
	loadGlbIntoEditorState: async (blob, editor) => {
		editor.setModelFile(blob);
		editor.ui.modelOffset = [-1, -2, -3];
	}
}));
import { downloadProcessingBundle, importProcessingResult } from './import-processing-result';
import { createDraft } from '$lib/state/shared-draft';
import { draftsState } from '$lib/state/drafts.svelte';
import {
	createProcessingAssetLoader,
	processingCropSource,
	preserveProcessingImports
} from './processing-assets';
const manifest = {
	processingId: 'run',
	captureId: 'capture',
	entryPath: 'new-crag',
	engine: 'meshroom',
	files: [{ path: 'model.glb' }, { path: 'project.json' }, { path: 'telemetry/flight.srt' }]
};
beforeEach(() => {
	database.records.clear();
	vi.clearAllMocks();
	api.getProcessingResults.mockResolvedValue(manifest);
	api.downloadResultFile.mockImplementation(
		async (_id, path) =>
			new Blob([
				path === 'project.json'
					? JSON.stringify({
							name: 'Wall',
							hits: [],
							cameras: { photo: [1, 2, 3] },
							coordinateSystem: 'Z_UP'
						})
					: path
			])
	);
});
it('imports reconstruction-only runs with durable model, cameras, telemetry and provenance', async () => {
	const result = await importProcessingResult('run');
	const draft = await draftsState.get(result.id);
	expect(draft.contexts[result.nodeId].glbBlob).toBeInstanceOf(Blob);
	expect(draft.contexts[result.nodeId].clustering.cameraPositions.photo).toEqual([1, 2, 3]);
	expect(draft.contexts[result.nodeId].modelRotation).toEqual([-Math.PI / 2, 0, 0]);
	expect(draft.processingImports[result.nodeId].pendingFiles).toContain('telemetry/flight.srt');
	expect(api.downloadResultFile.mock.calls.map((call) => call[1])).toEqual([
		'model.glb',
		'project.json'
	]);
});
it('adds a separate child without replacing edited routes', async () => {
	const source = createDraft('crag');
	source.workspace.topo = { routes: [{ id: 'manual' }] };
	await draftsState.save(source);
	const result = await importProcessingResult('run', source.id);
	const saved = await draftsState.get(result.id);
	expect(saved.workspace.topo.routes).toEqual([{ id: 'manual' }]);
	expect(saved.workspace.childEntries).toHaveLength(1);
	expect(result.nodeId).not.toBe(source.activeNodeId);
});
it('keeps drafts intact when result downloads fail', async () => {
	const source = createDraft('crag');
	await draftsState.save(source);
	api.downloadResultFile.mockRejectedValue(new Error('Download failed'));
	await expect(importProcessingResult('run', source.id)).rejects.toThrow('Download failed');
	expect((await draftsState.get(source.id)).workspace.childEntries).toEqual([]);
});
it('rejects unsafe manifest paths before downloading', async () => {
	api.getProcessingResults.mockResolvedValue({ ...manifest, files: [{ path: '../model.glb' }] });
	await expect(downloadProcessingBundle('run')).rejects.toThrow('Invalid result file path');
	expect(api.downloadResultFile).not.toHaveBeenCalled();
});

it('persists detection crops across draft restoration and retains coordinate conventions', async () => {
	const hit = {
		pos: [1, 2, 3],
		cam_pos: [4, 5, 6],
		conf: 0.9,
		class: 'bolt',
		img: 'frame.jpg',
		crop: 'crops/bolt.jpg'
	};
	api.getProcessingResults.mockResolvedValue({
		...manifest,
		files: [...manifest.files, { path: hit.crop }]
	});
	api.downloadResultFile.mockImplementation(
		async (_id, path) =>
			new Blob([
				path === 'project.json' ? JSON.stringify({ hits: [hit], coordinateSystem: 'Y_UP' }) : path
			])
	);
	const result = await importProcessingResult('run');
	const stored = await draftsState.get(result.id);
	expect(stored.contexts[result.nodeId].clustering.rawHits).toHaveLength(1);
	expect(stored.contexts[result.nodeId].modelRotation).toEqual([0, 0, 0]);
	expect(stored.contexts[result.nodeId].clustering.cropsMap[hit.crop]).toBe(
		processingCropSource('run', hit.crop)
	);
	const stale = structuredClone(stored);
	const loader = createProcessingAssetLoader(stored, (node, files) => {
		void draftsState.cacheProcessingFiles(result.id, node, 'run', files);
	});
	await loader.complete();
	const cached = await draftsState.get(result.id);
	expect(await cached.processingImports[result.nodeId].files[hit.crop].text()).toBe(hit.crop);
	// Saving an earlier editor snapshot must not discard independently cached images.
	await draftsState.save(stale);
	expect(
		await (await draftsState.get(result.id)).processingImports[result.nodeId].files[hit.crop].text()
	).toBe(hit.crop);
});

it('publishes imported files through the ordinary draft action plan', async () => {
	const { reviewActions } = await import('./review-package');
	const result = await importProcessingResult('run');
	const saved = await draftsState.get(result.id);
	const actions = await reviewActions(saved);
	expect(actions).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				action: 'write',
				path: expect.stringMatching(/^new-crag\/reconstruction-[^/]+\/reconstruction-[^/]+\.json$/)
			}),
			expect.objectContaining({ action: 'write', path: expect.stringMatching(/-topo\.json$/) }),
			expect.objectContaining({ action: 'write', path: expect.stringMatching(/\.glb$/) })
		])
	);
	expect(actions.every((action) => !action.path.startsWith('processing/'))).toBe(true);
});

it('preserves unfinished attachments before deletion without overwriting concurrent edits', async () => {
	const result = await importProcessingResult('run');
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	api.downloadResultFile.mockImplementation(async (_id, path) => {
		await gate;
		return new Blob([path]);
	});
	const preserve = preserveProcessingImports('run');
	await vi.waitFor(() => expect(api.downloadResultFile).toHaveBeenCalledTimes(3));
	const edited = await draftsState.get(result.id);
	edited.contexts[result.nodeId].name = 'Edited while downloading';
	await draftsState.save(edited);
	release();
	await preserve;
	const saved = await draftsState.get(result.id);
	expect(saved.contexts[result.nodeId].name).toBe('Edited while downloading');
	expect(saved.processingImports[result.nodeId].pendingFiles).toEqual([]);
	expect(await saved.processingImports[result.nodeId].files['telemetry/flight.srt'].text()).toBe(
		'telemetry/flight.srt'
	);
});

it('finishes pending files before creating a portable review archive', async () => {
	const { createReviewPackage, openReviewPackage } = await import('./review-package');
	const result = await importProcessingResult('run');
	const saved = await draftsState.get(result.id);
	const restored = await openReviewPackage(await createReviewPackage(saved), 'review');
	expect(restored.processingImports[result.nodeId].pendingFiles).toEqual([]);
	expect(await restored.processingImports[result.nodeId].files['telemetry/flight.srt'].text()).toBe(
		'telemetry/flight.srt'
	);
});
