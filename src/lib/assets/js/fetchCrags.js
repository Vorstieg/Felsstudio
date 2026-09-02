import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.js';
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

function getParentPath(path) {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

function manifestEntryToSector(entry) {
	return {
		id: entry.id,
		name: entry.name,
		path: entry.path,
		type: entry.type || [],
		geometry: entry.geometry,
		hash: entry.hash
	};
}

function manifestEntryToCragFeature(entry, sectors) {
	return {
		type: 'Feature',
		geometry: entry.geometry,
		properties: {
			id: entry.id,
			name: entry.name,
			path: entry.path,
			type: entry.type || [],
			hash: entry.hash,
			sectors
		}
	};
}

export const fetchCragsFromManifest = async (options = {}) => {
	const manifest = await readJson('manifest.json');
	const entries = Array.isArray(manifest) ? manifest : [];
	const paths = new Set(entries.map((entry) => entry.path).filter(Boolean));
	const sectorEntriesByParent = new Map();

	for (const entry of entries) {
		const parentPath = getParentPath(entry.path || '');
		if (!paths.has(parentPath)) continue;
		const sectors = sectorEntriesByParent.get(parentPath) || [];
		sectors.push(manifestEntryToSector(entry));
		sectorEntriesByParent.set(parentPath, sectors);
	}

	const crags = entries
		.filter((entry) => !paths.has(getParentPath(entry.path || '')))
		.map((entry) => manifestEntryToCragFeature(entry, sectorEntriesByParent.get(entry.path) || []));

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
					if (data.sector_id) return null;

					data.properties = data.properties || {};
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
