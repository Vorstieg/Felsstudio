import { readJson } from '$lib/api/felslager.js';
import { loadAccessCollection } from '$lib/assets/js/fetchCrags.js';
import { getCragEditorPath, splitEntryPath } from '$lib/assets/js/editor-entry-paths.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';

export { getCragEditorPath };

export async function loadCragEditorEntry(entryPath) {
	const { path, id: cragId } = splitEntryPath(entryPath);
	if (!cragId) return null;

	const topo = new Topo(path, cragId);
	const cragData = await readJson(topo.getCragPath());
	const crag = {
		...cragData.properties,
		geometry: cragData.geometry,
		sectors: await Promise.all(
			(cragData.properties.sectors || []).map(async (sector) => {
				try {
					const sectorData = await readJson(
						new Topo(topo.path, topo.cragId, sector.id).getSectorPath()
					);
					return {
						...sector,
						...sectorData.properties,
						id: sector.id,
						name: sectorData.properties.name || sector.name,
						geometry: sectorData.geometry
					};
				} catch {
					return sector;
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
			topoDocuments.map(async ({ sectorId, sectorTopo }) => {
				try {
					const path = sectorTopo.getTopoPath();
					const normalized = normalizeTopoPaths(await readJson(path));
					return { path, sectorId, data: normalized.data, dirty: normalized.migrated };
				} catch {
					return null;
				}
			})
		)
	).filter(Boolean);

	const state = { crag, access: null, routeDocuments };
	await loadAccessCollection(topo, state);
	return state;
}
