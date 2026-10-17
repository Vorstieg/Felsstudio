// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createDraft, draftNode, encodeDraft, createDraftResources } from './shared-draft';
afterEach(() => vi.unstubAllGlobals());
it('encodes only explicit media fields and restores previews without changing stored data', async () => {
	const fetch = vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' })));
	vi.stubGlobal('fetch', fetch);
	const draft = createDraft('2d');
	draftNode(draft).topo = {
		routes: [],
		image2D: 'blob:background',
		description: 'blob:literal-text'
	};
	draft.contexts[draft.activeNodeId] = {
		glbBlob: new Blob(['model']),
		clustering: {
			rawHits: [],
			cropsMap: { a: 'blob:crop', b: 'blob:crop', remote: 'https://example.test/image' }
		}
	};
	const stored = await encodeDraft(draft);
	expect(fetch).toHaveBeenCalledTimes(2);
	expect(stored.workspace.topo.image2D).toBeNull();
	expect(stored.workspace.topo.description).toBe('blob:literal-text');
	const resources = createDraftResources();
	const restored = resources.restore(stored);
	expect(restored.workspace.topo.image2D).toMatch(/^blob:/);
	expect(restored.contexts[draft.activeNodeId].clustering.cropsMap.a).toMatch(/^blob:/);
	expect(restored.contexts[draft.activeNodeId].clustering.cropsMap.remote).toBe(
		'https://example.test/image'
	);
	expect(await restored.contexts[draft.activeNodeId].glbBlob.text()).toBe('model');
	expect(stored.workspace.topo.image2D).toBeNull();
	resources.release();
});
it('rejects expired resources without silently dropping uploads', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new Error('Expired asset');
		})
	);
	const draft = createDraft('2d');
	draft.workspace.topo = { routes: [], image2D: 'blob:expired' };
	await expect(encodeDraft(draft)).rejects.toThrow('Expired asset');
});
