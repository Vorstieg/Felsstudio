// @vitest-environment node
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createDraft, draftNode, encodeDraft, createDraftResources } from '$lib/state/shared-draft';
import { createReviewPackage, openReviewPackage, reviewActions } from './review-package';

describe('immutable review archives', () => {
	it.each(['crag', '2d', '3d'])(
		'round-trips %s draft documents, blobs, files and ordinary text',
		async (mode) => {
			const draft = createDraft(mode);
			draft.placed = true;
			const node = draftNode(draft);
			node.topo = {
				routes: [{ id: 'route', points3D: [[1, 2, 3]] }],
				description: 'blob:ordinary-description',
				image2D: null
			};
			node.dirtyPaths.push('/new-crag/new-crag-topo.json');
			const image = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
			node.pendingImages = [
				{ clientId: 'image', file: image, path: 'new-crag/new-crag-image.jpg', previewUrl: '' }
			];
			node.images = [{ clientId: 'image', name: 'photo', path: 'new-crag/new-crag-image.jpg' }];
			draft.contexts[node.clientId] = {
				glbBlob: new Blob(['model'], { type: 'model/gltf-binary' })
			};
			draft.media[node.clientId] = {
				background: new Blob(['background'], { type: 'image/png' }),
				crops: { crop: new Blob(['crop'], { type: 'image/webp' }) }
			};
			draft.reviewId = 'old-review';
			draft.reviewProductionSaved = true;
			const body = await createReviewPackage(draft);
			node.topo.description = 'later edit';
			const first = await openReviewPackage(body, 'submission');
			const second = await openReviewPackage(body, 'submission');
			expect(first.id).not.toBe(draft.id);
			expect(first.id).not.toBe(second.id);
			expect(first.reviewId).toBe('submission');
			expect(first.reviewProductionSaved).toBeUndefined();
			expect(first.workspace.topo.description).toBe('blob:ordinary-description');
			expect(await first.workspace.pendingImages[0].file.text()).toBe('photo');
			expect(first.workspace.pendingImages[0].file.name).toBe('photo.jpg');
			expect(await first.contexts[node.clientId].glbBlob.text()).toBe('model');
			expect(await first.media[node.clientId].background.text()).toBe('background');
			expect(await first.media[node.clientId].crops.crop.text()).toBe('crop');
			const resources = createDraftResources();
			const live = resources.restore(first);
			// Native object URL reads model the inbox -> IndexedDB boundary.
			const stored = await encodeDraft(live);
			expect(await stored.media[node.clientId].background.text()).toBe('background');
			resources.release();
		}
	);
	it('describes real save actions without changing the source workspace or preview URLs', async () => {
		const draft = createDraft('crag');
		const node = draftNode(draft);
		node.sourcePath = 'old-wall';
		node.entry.properties.id = 'new-wall';
		node.removedPaths = ['new-wall/obsolete.json'];
		node.removedDirectories = ['new-wall/unused'];
		node.modelSourcePath = 'old-wall/old.glb';
		node.modelPath = 'new-wall/new.glb';
		node.dirtyPaths = ['new-wall/new-wall.json'];
		const before = structuredClone(draft);
		const actions = await reviewActions(draft);
		expect(actions).toContainEqual({ action: 'move', path: 'old-wall', destination: 'new-wall' });
		expect(actions).toContainEqual({ action: 'delete', path: 'new-wall/obsolete.json' });
		expect(actions).toContainEqual({ action: 'delete', path: 'new-wall/unused' });
		expect(actions).toContainEqual({ action: 'write', path: 'new-wall/new-wall.json' });
		expect(draft).toEqual(before);
	});
	it('rejects unplaced drafts, invalid paths, hierarchy errors and broken asset references', async () => {
		const draft = createDraft('2d');
		await expect(createReviewPackage(draft)).rejects.toThrow('production location');
		draft.placed = true;
		draft.workspace.removedPaths = ['../private'];
		await expect(createReviewPackage(draft)).rejects.toThrow('Invalid production path');
		draft.workspace.removedPaths = [];
		draft.workspace.entry.properties.id = '../private';
		await expect(createReviewPackage(draft)).rejects.toThrow();
		const zip = new JSZip();
		zip.file(
			'review.json',
			JSON.stringify({
				version: 1,
				draft: createDraft('crag'),
				assets: [{ path: 'assets/0', keys: ['__proto__', 'injected'] }]
			})
		);
		await expect(
			openReviewPackage(await zip.generateAsync({ type: 'arraybuffer' }), 'id')
		).rejects.toThrow('Invalid review asset');
	});
});
