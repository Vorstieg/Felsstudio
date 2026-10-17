// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ writeFile: vi.fn(), writeJson: vi.fn(), get: vi.fn() }));
vi.mock('$lib/api/felslager', () => ({
	...mocks,
	fileUrl: (path) => `https://lager.test/api/fs/${path}`
}));
vi.mock('$lib/state/drafts.svelte', () => ({ draftsState: { get: mocks.get } }));
import { publishDraftModels, publishTopoDocument } from './publish-draft-assets';

beforeEach(() => {
	vi.clearAllMocks();
});

it('uploads a local background and writes a durable URL into the production topo', async () => {
	const blob = new Blob(['image'], { type: 'image/png' });
	const url = URL.createObjectURL(blob);
	const topo = { routes: [], image2D: url };
	try {
		await publishTopoDocument('wall/wall-topo.json', topo);
		expect(mocks.writeFile).toHaveBeenCalledWith(
			'wall/wall-background.png',
			expect.any(Blob),
			'image/png'
		);
		expect(mocks.writeJson).toHaveBeenCalledWith('wall/wall-topo.json', {
			routes: [],
			image2D: 'https://lager.test/api/fs/wall/wall-background.png'
		});
		expect(topo.image2D).toBe(url);
	} finally {
		URL.revokeObjectURL(url);
	}
});

it('publishes a model at its current workspace destination and skips removed documents', async () => {
	const blob = new Blob(['glb']);
	mocks.get.mockResolvedValue({
		contexts: { node: { glbBlob: blob } },
		workspace: { clientId: 'node', modelPath: 'renamed/renamed.glb', childEntries: [] }
	});
	await publishDraftModels('draft');
	expect(mocks.writeFile).toHaveBeenCalledOnce();
	expect(mocks.writeFile).toHaveBeenCalledWith('renamed/renamed.glb', blob, 'model/gltf-binary');
});
