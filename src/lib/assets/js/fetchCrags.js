import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.js';

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' } = {}) => {
	// Get full recursive listing from Felslager
	const files = await listDir('entries', { recursive: true });

	// Filter for crag JSON files (exclude transit, parking, topo files)
	const cragFiles = files.filter((f) => {
		if (f.type !== 'file') return false;
		if (!f.path.endsWith('.json')) return false;
		const name = f.name.toLowerCase();
		if (name.includes('-transit')) return false;
		if (name.includes('-parking')) return false;
		if (name.includes('-topo')) return false;
		return true;
	});

	// Fetch each crag JSON in parallel
	const crags = await Promise.all(
		cragFiles.map(async (f) => {
			try {
				const data = await readJson(f.path);
				// Derive the directory path (strip 'entries/' prefix and filename)
				const parts = f.path.split('/');
				// f.path is like "entries/europe/austria/.../name.json"
				data.properties.path = parts.slice(1, -1).join('/');
				return data;
			} catch (err) {
				console.warn('Failed to load crag:', f.path, err);
				return null;
			}
		})
	);

	let sortedCrags = crags
		.filter(Boolean)
		.sort((a, b) => new Date(b.properties.date) - new Date(a.properties.date));

	if (search) {
		sortedCrags = sortedCrags.filter(
			(crag) =>
				crag.properties.name.toLowerCase().includes(search.toLowerCase()) ||
				crag.properties.type.includes(search) ||
				crag.properties.path.toLowerCase().includes(search.toLowerCase())
		);
	}

	if (offset) {
		sortedCrags = sortedCrags.slice(offset);
	}

	if (limit && limit < sortedCrags.length && limit !== -1) {
		sortedCrags = sortedCrags.slice(0, limit);
	}

	return sortedCrags;
};

export default fetchCrags;
