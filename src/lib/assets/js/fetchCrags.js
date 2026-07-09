import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.js';
import {
	isSectorFeature,
	normalizeEntryPath,
	normalizeSectorFeature,
	pathDirname,
	pathsReferToSameEntry,
	resolveEntryPath
} from '$lib/assets/js/sector-utils.js';

function isEntryJsonFile(file) {
	if (file.type !== 'file') return false;
	if (!file.path.endsWith('.json')) return false;

	const name = file.name.toLowerCase();
	if (name.includes('-transit')) return false;
	if (name.includes('-parking')) return false;
	if (name.includes('-topo')) return false;

	return true;
}

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' } = {}) => {
	const files = await listDir('', { recursive: true });
	const entryFiles = files.filter(isEntryJsonFile);

	const entries = (
		await Promise.all(
			entryFiles.map(async (file) => {
				try {
					const data = await readJson(file.path);
					data.properties = data.properties || {};
					data.properties.path = pathDirname(normalizeEntryPath(file.path));
					data.properties.filePath = file.path;
					return data;
				} catch (err) {
					console.warn('Failed to load crag entry:', file.path, err);
					return null;
				}
			})
		)
	).filter(Boolean);

	const crags = [];
	const sectors = [];

	entries.forEach((entry) => {
		if (isSectorFeature(entry)) {
			sectors.push(normalizeSectorFeature(entry, entry.properties.filePath));
			return;
		}

		crags.push(entry);
	});

	crags.forEach((crag) => {
		const properties = crag.properties || {};
		const embeddedSectors = (properties.sectors || []).map((sector) => {
			return {
				...sector,
				kind: 'sector',
				parent_id: sector.parent_id || properties.id,
				parent_path: properties.path,
				path: resolveEntryPath(properties.path, sector.path, sector.id)
			};
		});
		const childSectors = sectors
			.filter((sector) => {
				return (
					sector.parent_id === properties.id ||
					pathsReferToSameEntry(sector.parent_path, properties.path) ||
					pathsReferToSameEntry(pathDirname(sector.path), properties.path)
				);
			})
			.map((sector) => ({
				...sector,
				parent_path: properties.path,
				path: resolveEntryPath(properties.path, sector.path, sector.id)
			}));
		const sectorIds = new Set();
		properties.sectors = [...embeddedSectors, ...childSectors]
			.filter((sector) => {
				const key = sector.id || sector.path || sector.name;
				if (!key) return true;
				if (sectorIds.has(key)) return false;
				sectorIds.add(key);
				return true;
			})
			.sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
		crag.properties = properties;
	});

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

export default fetchCrags;
