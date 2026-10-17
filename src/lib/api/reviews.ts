import { authState } from './auth.svelte';
import type { ReviewAction } from '$lib/assets/js/review-package';

const URL = (
	import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs'
).replace(/\/fs\/?$/, '/reviews');
export type Review = {
	id: string;
	name: string;
	created: string;
	actions: ReviewAction[];
};
async function request(path = '', init: RequestInit = {}) {
	const response = await fetch(`${URL}${path}`, { credentials: 'include', ...init });
	if (!response.ok) {
		if (response.status === 401 || response.status === 403)
			authState.handleRejection(response.status);
		const data = await response.json().catch(() => ({}));
		throw new Error(data.message || data.code || `Review request failed (${response.status})`);
	}
	return response;
}
export const submitReview = async (body: Blob): Promise<Review> =>
	(
		await request('', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body })
	).json();
export const listReviews = async (): Promise<Review[]> => (await request()).json();
export const getReview = async (id: string): Promise<Review> =>
	(await request(`/${encodeURIComponent(id)}`)).json();
export const downloadReview = async (id: string): Promise<Blob> =>
	(await request(`/${encodeURIComponent(id)}/archive`)).blob();
export const deleteReview = async (id: string): Promise<void> => {
	await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
