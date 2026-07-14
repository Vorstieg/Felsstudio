import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.js';

function isEntryJsonFile(file) {
	if (file.type !== 'file') return false;
	if (!file.path.endsWith('.json')) return false;

	const name = file.name.toLowerCase();
	if (name.includes('-transit')) return false;
	if (name.includes('-parking')) return false;
	return !name.includes('-topo');
}

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' } = {}) => {
	const files = await listDir('', { recursive: true });
	const entryFiles = files.filter(isEntryJsonFile);

	const crags = (
		await Promise.all(
			entryFiles.map(async (file) => {
				try {
					const data = await readJson(file.path);
					if (data.sector_id) return null;

					data.properties = data.properties || {};
					data.properties.id = file.name.slice(0, -'.json'.length);
					data.properties.path = file.path.slice(
						0,
						-(data.properties.id.length + 1 + file.name.length)
					);
					return data;
				} catch (err) {
					console.warn('Failed to load crag entry:', file.path, err);
					return null;
				}
			})
		)
	).filter(Boolean);

	let sortedCrags = crags.sort((a, b) => new Date(b.properties.date) - new Date(a.properties.date));

	if (search) {
		const query = search.toLowerCase();
		sortedCrags = sortedCrags.filter((crag) => {
			const sectors = crag.properties.sectors || [];
			return (
				crag.properties.name.toLowerCase().includes(query) ||
				crag.properties.type.includes(search) ||
				crag.properties.path.toLowerCase().includes(query) ||
				sectors.some(
					(sector) =>
						(sector.name || '').toLowerCase().includes(query) ||
						(sector.id || '').toLowerCase().includes(query) ||
						(sector.type || []).includes(search)
				)
			);
		});
	}

	if (offset) {
		sortedCrags = sortedCrags.slice(offset);
	}

	if (limit && limit < sortedCrags.length && limit !== -1) {
		sortedCrags = sortedCrags.slice(0, limit);
	}

	return sortedCrags;
};

export async function loadGeoJsonFiles(topo, cragEditorState) {
	try {
		const dirFiles = await listDir(topo.path);
		for (const f of dirFiles) {
			if (f.type !== 'file' || !f.name.endsWith('.json') || f.name === `${topo.getBaseName()}.json`)
				continue;
			try {
				if (f.name.includes('-transit-track')) {
					const data = await readJson(`${topo.path}/${f.name}`);
					cragEditorState.tracks.push({
						id: Math.random().toString(36).substr(2, 9),
						name: data.properties.name || 'Approach Track',
						coordinates: data.geometry.coordinates
					});
				} else if (f.name.includes('-transit')) {
					const data = await readJson(`${topo.path}/${f.name}`);
					cragEditorState.transit.push({
						id: Math.random().toString(36).substr(2, 9),
						name: data.properties.name,
						type: data.properties.type || 'bus',
						coordinates: data.geometry.coordinates
					});
				} else if (f.name.includes('-parking')) {
					const data = await readJson(`${topo.path}/${f.name}`);
					cragEditorState.parking.push({
						id: Math.random().toString(36).substr(2, 9),
						coordinates: data.geometry.coordinates
					});
				}
			} catch {
				/* skip unreadable files */
			}
		}
	} catch {
		/* directory listing may fail */
	}
}

export default fetchCrags;
