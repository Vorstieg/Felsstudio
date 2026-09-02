import { loadCragEditorEntry } from '$lib/assets/js/load-crag-editor-entry.js';

/** @type {import('./$types').PageLoad} */
export const load = async ({ params, url }) => {
	// If a draft is explicitly requested, do not fetch the source crag first.
	// The client-side editor will restore the requested localStorage draft by id.
	if (url.searchParams.has('draft')) return { initialSession: null };

	const initialSession = await loadCragEditorEntry(params.entry);
	return { initialSession };
};
