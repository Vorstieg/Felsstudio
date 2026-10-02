import { cragsPerPage } from '$lib/config';
import { listDir, readJson } from '$lib/api/felslager.ts';
import type { ApiListEntry } from '$lib/types/api';
import type { FelsEntry } from '@vorstieg/fels-types/types';

type CragFeature = FelsEntry & { entryPath: string };
type FetchOptions = { offset?: number; limit?: number; search?: string };
type ManifestEntry = Pick<FelsEntry['properties'], 'id' | 'name' | 'kind'> & {
	path: string;
	geometry: FelsEntry['geometry'];
	type?: string[];
	hash?: string;
};

function isEntryJsonFile(file: ApiListEntry): boolean {
	if (file.type !== 'file') return false;
	if (!file.path.endsWith('.json')) return false;

	const name = file.name.toLowerCase();
	if (name.includes('-transit')) return false;
	if (name.includes('-parking')) return false;
	if (name.endsWith('-access.json')) return false;
	return !name.includes('-topo');
}

function getEntryPathFromFile(filePath: string): string {
	const parts = String(filePath || '')
		.split('/')
		.filter(Boolean);
	const filename = parts.pop() || '';
	const id = filename.replace(/\.json$/i, '');
	if (!id) return '';
	return parts.at(-1) === id ? parts.join('/') : [...parts, id].join('/');
}

function filterAndPaginateCrags(
	crags: CragFeature[],
	{ offset = 0, limit = cragsPerPage, search = '' }: FetchOptions = {}
): CragFeature[] {
	let filteredCrags = crags;

	if (search) {
		const query = search.toLowerCase();
		filteredCrags = filteredCrags.filter((crag) => {
			return (
				(crag.properties?.name ?? '').toLowerCase().includes(query) ||
				(crag.properties?.type?.includes(search) ?? false) ||
				crag.entryPath.toLowerCase().includes(query)
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

function manifestEntryToCragFeature(entry: ManifestEntry): CragFeature {
	return {
		type: 'Feature',
		entryPath: entry.path,
		geometry: entry.geometry,
		properties: {
			id: entry.id,
			name: entry.name,
			kind: entry.kind,
			type: entry.type || [],
			hash: entry.hash
		}
	};
}

export const fetchCragsFromManifest = async (
	options: FetchOptions = {}
): Promise<CragFeature[]> => {
	const manifest = await readJson<ManifestEntry[]>('manifest.json');
	const entries = Array.isArray(manifest) ? manifest : [];
	const crags = entries.map((entry) => manifestEntryToCragFeature(entry));

	return filterAndPaginateCrags(crags, options);
};

const fetchCrags = async ({ offset = 0, limit = cragsPerPage, search = '' }: FetchOptions = {}) => {
	const files = await listDir('', { recursive: true });
	const entryFiles = files.filter(isEntryJsonFile);

	const crags = (
		await Promise.all(
			entryFiles.map(async (file) => {
				try {
					const data = await readJson<FelsEntry>(file.path);
					data.properties = data.properties || {};
					data.properties.id = file.name.slice(0, -'.json'.length);
					return { ...data, entryPath: getEntryPathFromFile(file.path) };
				} catch (err) {
					console.warn('Failed to load crag entry:', file.path, err);
					return null;
				}
			})
		)
	).filter((crag): crag is CragFeature => crag !== null);

	const sortedCrags = crags.sort(
		(a, b) =>
			new Date(b.properties.date ?? '').getTime() - new Date(a.properties.date ?? '').getTime()
	);
	return filterAndPaginateCrags(sortedCrags, { offset, limit, search });
};

export default fetchCrags;
