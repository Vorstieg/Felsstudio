import type { PageLoad } from './$types';
import { fetchCragsFromManifest } from '$lib/assets/js/fetchCrags.ts';

export const load: PageLoad = async () => {
	const locations = await fetchCragsFromManifest({ limit: -1 });
	return { locations };
};
