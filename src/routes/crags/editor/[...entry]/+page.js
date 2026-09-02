import { loadCragEditorEntry } from '$lib/assets/js/load-crag-editor-entry.js';

/** @type {import('./$types').PageLoad} */
export const load = async ({ params }) => {
	const initialSession = await loadCragEditorEntry(params.entry);
	return { initialSession };
};
