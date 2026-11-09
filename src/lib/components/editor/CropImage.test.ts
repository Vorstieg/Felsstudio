import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import CropImage from './CropImage.svelte';
const loader = vi.hoisted(() => ({ ready: true, loadProcessingCrop: vi.fn() }));
vi.mock('./use-draft-editor.svelte', () => ({ getDraftEditor: () => loader }));
let intersect: (entries: { isIntersecting: boolean }[]) => void;
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal(
		'IntersectionObserver',
		vi.fn(function (callback) {
			intersect = callback;
			return { observe: vi.fn(), disconnect: vi.fn() };
		})
	);
	vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:crop'), revokeObjectURL: vi.fn() });
	loader.loadProcessingCrop.mockResolvedValue(new Blob(['crop']));
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it('does not request offscreen thumbnails and releases their previews', async () => {
	const view = render(CropImage, { src: 'processing-crop:run:crop.jpg', alt: 'Detection' });
	expect(loader.loadProcessingCrop).not.toHaveBeenCalled();
	intersect([{ isIntersecting: true }]);
	await waitFor(() => expect(view.getByAltText('Detection')).toHaveAttribute('src', 'blob:crop'));
	expect(loader.loadProcessingCrop).toHaveBeenCalledTimes(1);
	view.unmount();
	expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:crop');
});
it('requests the selected preview immediately and supports retry after failure', async () => {
	loader.loadProcessingCrop.mockRejectedValueOnce(new Error('Offline'));
	const view = render(CropImage, {
		src: 'processing-crop:run:crop.jpg',
		alt: 'Preview',
		eager: true
	});
	await waitFor(() => expect(view.getByRole('button', { name: 'Retry image' })).toBeVisible());
	view.getByRole('button', { name: 'Retry image' }).click();
	await waitFor(() => expect(view.getByAltText('Preview')).toHaveAttribute('src', 'blob:crop'));
	expect(loader.loadProcessingCrop).toHaveBeenCalledTimes(2);
});
