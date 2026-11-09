// @vitest-environment node
import { expect, it, vi, beforeEach } from 'vitest';
import { createProcessingAssetLoader, processingCropSource } from './processing-assets';
import type { SharedDraft } from '$lib/state/shared-draft';
const api = vi.hoisted(() => ({ downloadResultFile: vi.fn() }));
vi.mock('$lib/api/processing', () => api);
beforeEach(() => vi.resetAllMocks());
const draft = (count = 200) =>
	({
		processingImports: {
			node: {
				processingId: 'run',
				files: {},
				pendingFiles: Array.from({ length: count }, (_, i) => `crops/${i}.jpg`)
			}
		}
	}) as unknown as SharedDraft;

it('reserves capacity for selected crops and deduplicates foreground/background requests', async () => {
	const pending = new Map<string, (blob: Blob) => void>();
	api.downloadResultFile.mockImplementation(
		(_id, path) => new Promise((resolve) => pending.set(path, resolve))
	);
	const loader = createProcessingAssetLoader(draft());
	loader.start();
	expect(api.downloadResultFile.mock.calls.map((call) => call[1])).toEqual([
		'crops/0.jpg',
		'crops/1.jpg'
	]);
	const selected = loader.load(processingCropSource('run', 'crops/199.jpg'));
	const again = loader.load(processingCropSource('run', 'crops/199.jpg'));
	expect(again).toBe(selected);
	expect(api.downloadResultFile).toHaveBeenCalledTimes(3);
	pending.get('crops/199.jpg')!(new Blob(['selected']));
	expect(await (await selected).text()).toBe('selected');
	expect(await (await loader.load(processingCropSource('run', 'crops/199.jpg'))).text()).toBe(
		'selected'
	);
	expect(api.downloadResultFile).toHaveBeenCalledTimes(3);
	loader.stop();
	pending.get('crops/0.jpg')!(new Blob());
	pending.get('crops/1.jpg')!(new Blob());
});

it('reuses persistent blobs offline and materializes all pending files for review packages', async () => {
	const saved = draft(2);
	saved.processingImports!.node.files['crops/0.jpg'] = new Blob(['cached']);
	api.downloadResultFile.mockResolvedValue(new Blob(['downloaded']));
	const loader = createProcessingAssetLoader(saved);
	await loader.complete();
	expect(api.downloadResultFile).toHaveBeenCalledTimes(1);
	expect(await saved.processingImports!.node.files['crops/0.jpg'].text()).toBe('cached');
	expect(await saved.processingImports!.node.files['crops/1.jpg'].text()).toBe('downloaded');
	expect(saved.processingImports!.node.pendingFiles).toEqual([]);
});

it('allows a failed background download to retry when selected', async () => {
	api.downloadResultFile
		.mockRejectedValueOnce(new Error('Offline'))
		.mockResolvedValue(new Blob(['retry']));
	const loader = createProcessingAssetLoader(draft(1));
	await expect(loader.load(processingCropSource('run', 'crops/0.jpg'), false)).rejects.toThrow(
		'Offline'
	);
	expect(await (await loader.load(processingCropSource('run', 'crops/0.jpg'))).text()).toBe(
		'retry'
	);
});
