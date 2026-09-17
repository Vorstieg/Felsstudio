import type { CragFeature, SectorFeature } from '@vorstieg/fels-data/types';
import type { CragSector, LoadedCragEditorEntry, RouteDocument } from '$lib/types/crag';
import { readJson } from '$lib/api/felslager.ts';
import { loadAccessCollection } from '$lib/assets/js/fetchCrags.js';
import { getCragEditorPath, splitEntryPath } from '$lib/assets/js/editor-entry-paths.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';

export { getCragEditorPath };

export async function loadCragEditorEntry(
	entryPath: string
): Promise<LoadedCragEditorEntry | null> {
	const { path, id: cragId } = splitEntryPath(entryPath);
	if (!cragId) return null;

	const topo = new Topo(path, cragId);
	const cragData = await readJson<CragFeature>(topo.getCragPath());
	const crag = {
		...cragData.properties,
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
		sourceCrag: { path, id: cragId }
	};
	await loadAccessCollection(topo, state);
	return state;
}
