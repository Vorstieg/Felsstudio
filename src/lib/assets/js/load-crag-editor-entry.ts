import type { CragFeature, SectorFeature } from '@vorstieg/fels-data/types';
import type {
	CragSector,
	EditableCrag,
	HierarchyEntry,
	LoadedCragEditorEntry,
	RouteDocument
} from '$lib/types/crag';
import { normalizeCragSector } from '$lib/state/crag-session.svelte.ts';
import { readJson } from '$lib/api/felslager.ts';
import { loadAccessCollection } from '$lib/assets/js/fetchCrags.js';
import { getCragEditorPath, splitEntryPath } from '$lib/assets/js/editor-entry-paths.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';

export { getCragEditorPath };

function hierarchyKey(path: string, id: string): string {
	return [path, id].filter(Boolean).join('/');
}

export function getHierarchySourceRefs(entryPath: string) {
	const parts = entryPath
		.replace(/^\/+|\/+$/g, '')
		.split('/')
		.filter(Boolean);
	return parts.map((id, index) => ({ path: parts.slice(0, index).join('/'), id }));
}

export async function loadHierarchyEntries(
	path: string,
	id: string,
	currentData: CragFeature,
	reader: typeof readJson = readJson
): Promise<HierarchyEntry[]> {
	const sources = getHierarchySourceRefs(hierarchyKey(path, id));
	const missingEntryIndexes = new Set<number>();
	const loaded = await Promise.all(
		sources.map(async ({ id: entryId, path: sourcePath }, index) => {
			try {
				const data =
					index === sources.length - 1
						? currentData
						: await reader<CragFeature>(new Topo(sourcePath, entryId).getCragPath());
				const { type: _type, properties, geometry, ...featureExtras } = data;
				const entry: HierarchyEntry = {
					key: hierarchyKey(sourcePath, entryId),
					feature: {
						...properties,
						id: properties.id || entryId,
						kind: properties.kind || (index === sources.length - 1 ? 'crag' : 'area'),
						path: sourcePath,
						geometry,
						sectors: (properties.sectors || []).map((child) => normalizeCragSector(child))
					} as EditableCrag,
					source: { path: sourcePath, id: entryId },
					parentKey: index ? hierarchyKey(sources[index - 1].path, sources[index - 1].id) : null,
					childKeys:
						index < sources.length - 1
							? [hierarchyKey(sources[index + 1].path, sources[index + 1].id)]
							: [],
					dirty: false,
					isCurrent: index === sources.length - 1,
					featureExtras
				};
				return entry;
			} catch {
				missingEntryIndexes.add(index);
				// Keep path-only folders in the hierarchy. They become ordinary dirty
				// entries when edited and are then written as a new crag.json on save.
				return {
					key: hierarchyKey(sourcePath, entryId),
					feature: {
						id: entryId,
						name: entryId,
						kind: index === sources.length - 1 ? 'crag' : 'area',
						path: sourcePath,
						type: [],
						tags: [],
						security: '',
						rock_type: '',
						description_de: '',
						description_en: '',
						equipment: [],
						assets: { images: [] },
						sectors: [],
						topo: { site: '', link: '' },
						geometry: currentData.geometry
					} as EditableCrag,
					source: { path: sourcePath, id: entryId },
					parentKey: index ? hierarchyKey(sources[index - 1].path, sources[index - 1].id) : null,
					childKeys:
						index < sources.length - 1
							? [hierarchyKey(sources[index + 1].path, sources[index + 1].id)]
							: [],
					dirty: false,
					isCurrent: index === sources.length - 1
				} as HierarchyEntry;
			}
		})
	);
	// A saved fallback entry must retain the path child that caused it to be
	// created. Otherwise editing that ancestor would write an empty `sectors`
	// list and sever the hierarchy in its metadata.
	for (const index of missingEntryIndexes) {
		const parent = loaded[index];
		const child = loaded[index + 1];
		if (!child || parent.feature.sectors.some((sector) => sector.id === child.feature.id)) continue;
		parent.feature.sectors.push(
			normalizeCragSector({
				id: String(child.feature.id || ''),
				name: String(child.feature.name || ''),
				kind: child.feature.kind as CragSector['kind']
			})
		);
	}
	return loaded;
}

export async function loadCragEditorEntry(
	entryPath: string
): Promise<LoadedCragEditorEntry | null> {
	const { path, id: cragId } = splitEntryPath(entryPath);
	if (!cragId) return null;

	const topo = new Topo(path, cragId);
	const cragData = await readJson<CragFeature>(topo.getCragPath());
	const crag = {
		...cragData.properties,
		// Storage location is runtime editor state, not persisted feature metadata.
		path,
		kind: cragData.properties.kind || 'crag',
		geometry: cragData.geometry,
		sectors: await Promise.all(
			(cragData.properties.sectors || []).map(async (sector): Promise<CragSector> => {
				try {
					const sectorData = await readJson<SectorFeature>(
						new Topo(topo.path, topo.cragId, sector.id).getSectorPath()
					);
					return {
						...sector,
						...sectorData.properties,
						kind: sectorData.properties.kind || 'sector',
						id: sector.id,
						name: sectorData.properties.name || sector.name,
						geometry: sectorData.geometry
					};
				} catch {
					return sector as CragSector;
				}
			})
		)
	};
	const hierarchyEntries = await loadHierarchyEntries(path, cragId, cragData);
	const currentHierarchyEntry = hierarchyEntries.find((entry) => entry.isCurrent);
	if (currentHierarchyEntry) currentHierarchyEntry.feature = crag;

	const topoDocuments = [
		{ sectorId: null, sectorTopo: topo },
		...crag.sectors.map((sector) => ({
			sectorId: sector.id,
			sectorTopo: new Topo(topo.path, topo.cragId, sector.id)
		}))
	];
	const routeDocuments = (
		await Promise.all(
			topoDocuments.map(async ({ sectorId, sectorTopo }): Promise<RouteDocument | null> => {
				try {
					const path = sectorTopo.getTopoPath();
					const normalized = normalizeTopoPaths(await readJson(path));
					return { path, sectorId, data: normalized.data, dirty: normalized.migrated };
				} catch {
					return null;
				}
			})
		)
	).filter((entry): entry is RouteDocument => Boolean(entry));

	const state: LoadedCragEditorEntry = {
		crag,
		access: null as never,
		routeDocuments,
		sectorStorageMoves: [],
		sourceCrag: { path, id: cragId },
		hierarchyEntries,
		activeMetadataTarget: currentHierarchyEntry
			? { type: 'entry', key: currentHierarchyEntry.key }
			: null
	};
	await loadAccessCollection(topo, state);
	return state;
}
