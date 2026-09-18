import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.ts';
import { normalizeAccessCollection } from '$lib/assets/js/access-geojson.js';

/** @typedef {import('@vorstieg/fels-data/types').CragFeature} CragFeature */

function isEntryJsonFile(file) {
	if (file.type !== 'file') return false;
	if (!file.path.endsWith('.json')) return false;

	const name = file.name.toLowerCase();
	if (name.includes('-transit')) return false;
	if (name.includes('-parking')) return false;
	return !name.includes('-topo');
}

function filterAndPaginateCrags(crags, { offset = 0, limit = cragsPerPage, search = '' } = {}) {
	let filteredCrags = crags;

	if (search) {
		const query = search.toLowerCase();
		filteredCrags = filteredCrags.filter((crag) => {
			const sectors = crag.properties?.sectors ?? [];
			return (
				(crag.properties?.name ?? '').toLowerCase().includes(query) ||
				(crag.properties?.type?.includes(search) ?? false) ||
				(crag.properties?.path ?? '').toLowerCase().includes(query) ||
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
		filteredCrags = filteredCrags.slice(offset);
	}

	if (limit && limit < filteredCrags.length && limit !== -1) {
		filteredCrags = filteredCrags.slice(0, limit);
	}

	return filteredCrags;
}

function manifestEntryToCragFeature(entry) {
	return {
		type: 'Feature',
		geometry: entry.geometry,
		properties: {
			id: entry.id,
			name: entry.name,
			kind: entry.kind,
			path: entry.path,
			type: entry.type || [],
			hash: entry.hash,
			sectors: entry.sectors || []
		}
	};
}

export const fetchCragsFromManifest = async (options = {}) => {
	const manifest = await readJson('manifest.json');
	const entries = Array.isArray(manifest) ? manifest : [];
	const crags = entries
		.filter((entry) => entry.kind !== 'sector')
		.map((entry) => manifestEntryToCragFeature(entry));

	return filterAndPaginateCrags(crags, options);
};

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' } = {}) => {
	const files = await listDir('', { recursive: true });
	const entryFiles = files.filter(isEntryJsonFile);

	const crags = (
		await Promise.all(
			entryFiles.map(async (file) => {
				try {
					const data = await /** @type {Promise<CragFeature>} */ (readJson(file.path));
					data.properties = data.properties || {};
					if (data.properties.kind === 'sector') return null;

					data.properties.id = file.name.slice(0, -'.json'.length);
					return data;
				} catch (err) {
					console.warn('Failed to load crag entry:', file.path, err);
					return null;
				}
			})
		)
	).filter(Boolean);

	const sortedCrags = crags.sort(
		(a, b) => new Date(b.properties.date) - new Date(a.properties.date)
	);
	return filterAndPaginateCrags(sortedCrags, { offset, limit, search });
};

export async function loadAccessCollection(topo, cragEditorState) {
	try {
		const data = await readJson(topo.getAccessPath());
		cragEditorState.access = normalizeAccessCollection(data);
	} catch {
		cragEditorState.access = normalizeAccessCollection(null);
	}
}

export default fetchCrags;
