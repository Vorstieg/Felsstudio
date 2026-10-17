// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	write: vi.fn(),
	writeFile: vi.fn(),
	remove: vi.fn(),
	rename: vi.fn(),
	deleteReview: vi.fn(),
	get: vi.fn(),
	topo: vi.fn()
}));
vi.mock('$lib/api/felslager', () => ({
	writeJson: mocks.write,
	writeFile: mocks.writeFile,
	deleteFile: mocks.remove,
	renameFile: mocks.rename
}));
vi.mock('$lib/api/reviews', () => ({ getReview: mocks.get, deleteReview: mocks.deleteReview }));
vi.mock('./publish-draft-assets', () => ({ publishTopoDocument: mocks.topo }));
import { createDraft } from '$lib/state/shared-draft';
import { publishReview } from './publish-review';
beforeEach(() => {
	vi.resetAllMocks();
	mocks.get.mockResolvedValue({});
});
function draft() {
	const value = createDraft('crag');
	value.reviewId = 'review';
	return value;
}
describe('review publication', () => {
	it('publishes and deletes the review after persisting the cleanup checkpoint', async () => {
		const value = draft();
		const persist = vi.fn();
		expect(await publishReview(value, persist)).toBe(true);
		expect(mocks.write).toHaveBeenCalledOnce();
		expect(persist).toHaveBeenCalledOnce();
		expect(mocks.deleteReview).toHaveBeenCalledWith('review');
		expect(mocks.deleteReview.mock.invocationCallOrder[0]).toBeGreaterThan(
			persist.mock.invocationCallOrder[0]
		);
	});
	it('retains completed operations after partial production failure and keeps the review in the inbox', async () => {
		const value = draft();
		const node = value.workspace;
		node.topo = { routes: [] };
		node.dirtyPaths = ['/new-crag/new-crag.json', '/new-crag/new-crag-topo.json'];
		mocks.topo.mockRejectedValueOnce(new Error('upload failed'));
		await expect(publishReview(value, vi.fn())).rejects.toThrow('upload failed');
		expect(node.dirtyPaths).not.toContain('/new-crag/new-crag.json');
		expect(node.dirtyPaths).toContain('/new-crag/new-crag-topo.json');
		expect(value.reviewProductionSaved).toBeUndefined();
		expect(mocks.deleteReview).not.toHaveBeenCalled();
		await publishReview(value, vi.fn());
		expect(mocks.write).toHaveBeenCalledOnce();
		expect(mocks.topo).toHaveBeenCalledTimes(2);
	});
	it('retries deletion without repeating production writes after a lost response', async () => {
		const value = draft();
		mocks.deleteReview.mockRejectedValueOnce(new Error('cleanup unavailable'));
		await expect(publishReview(value, vi.fn())).rejects.toThrow('cleanup unavailable');
		expect(value.reviewProductionSaved).toBe(true);
		await publishReview(value, vi.fn());
		expect(mocks.write).toHaveBeenCalledOnce();
		expect(mocks.deleteReview).toHaveBeenCalledTimes(2);
		expect(value.reviewId).toBeUndefined();
		expect(value.reviewProductionSaved).toBeUndefined();
	});
	it('does not publish a review that no longer exists', async () => {
		mocks.get.mockRejectedValue(new Error('REVIEW_NOT_FOUND'));
		await expect(publishReview(draft(), vi.fn())).rejects.toThrow('REVIEW_NOT_FOUND');
		expect(mocks.write).not.toHaveBeenCalled();
	});
});
