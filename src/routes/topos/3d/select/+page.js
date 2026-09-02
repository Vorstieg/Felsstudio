import { fetchCragsFromManifest } from '$lib/assets/js/fetchCrags.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async () => {
	const locations = await fetchCragsFromManifest({ limit: -1 });
	return { locations };
};
