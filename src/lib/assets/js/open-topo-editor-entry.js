import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { fileUrl, readJson } from '$lib/api/felslager.js';
import { draftsState } from '$lib/state/drafts.svelte.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.js';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';
import { getTopoEditorPath, splitEntryPath } from '$lib/assets/js/editor-entry-paths.js';

export async function persistTopoSessionImmediately(topoSession, snapshot = (value) => value) {
	draftsState.load();
	topoSession.ui.activeDraftId = await draftsState.save(
		topoSession.topo,
		topoSession.ui.activeDraftId,
		{
			clustering: snapshot(topoSession.clustering),
			glbBlob: topoSession.transient.glbBlob
		}
	);
	topoSession.ui.lastSaved = new Date().toISOString();
	return topoSession.ui.activeDraftId;
}

function getCragDirectory(topo) {
	return [topo.path, topo.cragId].filter(Boolean).join('/');
}

export { getTopoEditorPath };

export function getTopoSourceEntryPath(entryPath, sectorId = null) {
	const splitPath = splitEntryPath(entryPath);
	return new Topo(splitPath.path, splitPath.id, sectorId)._getPath();
}

export async function loadTopoEditorEntry({
	crag,
	entryPath,
	sector = null,
	sectorId = null,
	workspace,
	topoSession
}) {
	topoSession.reset();
	const splitPath = splitEntryPath(crag?.properties?.path || entryPath);
	const topo = new Topo(splitPath.path, splitPath.id, sector?.id || sectorId);
	let entry = crag || {
		properties: {
			...splitPath,
			name: splitPath.id
		}
	};
	if (!crag) {
		try {
			const cragData = await readJson(new Topo(splitPath.path, splitPath.id).getCragPath());
			entry = { ...cragData, properties: { ...entry.properties, ...cragData.properties } };
		} catch {
			/* crag file may not exist */
		}
	}
	const name = entry.properties.name;
	let loadedTopo = false;

	if (workspace.startsWith('/topos/2d')) {
		try {
			topoSession.topo = {
				...topoSession.topo,
				...normalizeTopoPaths(await readJson(topo.getTopoPath())).data
			};
		} catch {
			/* no topo yet */
		}
		topoSession.topo.editorMode = '2d';

		const imgNames = [`${name}.jpg`, `${name}.png`, 'topo.jpg'];
		for (const imgName of imgNames) {
			try {
				const imageUrl = fileUrl(`${getCragDirectory(topo)}/${imgName}`);
				const res = await fetch(imageUrl);
				if (res.ok) {
					topoSession.topo.image2D = imageUrl;
					break;
				}
			} catch {
				/* try next */
			}
		}
	} else {
		try {
			const topoData = normalizeTopoPaths(await readJson(topo.getTopoPath())).data;
			topoSession.topo = { ...topoSession.topo, ...topoData };
			initializeIdCounters(topoSession.topo);
		} catch {
			/* no topo yet */
		}

		topoSession.topo.editorMode = '3d';
		const glbUrl = fileUrl(topo.getGlbPath());
		try {
			const res = await fetch(glbUrl);
			if (res.ok) {
				loadedTopo = true;
				const blob = await res.blob();
				await loadGlbIntoEditorState(new File([blob], `${topo.getBaseName()}.glb`), topoSession);
			}
		} catch {
			/* GLB may not exist */
		}
	}

	topoSession.topo._entryPath = topo._getPath();
	topoSession.topo._topoFileName = topo.getTopoPath();

	return { loadedTopo, topo };
}

export async function openTopoEditorEntry({
	crag,
	sector = null,
	workspace,
	topoSession,
	snapshot
}) {
	const { loadedTopo } = await loadTopoEditorEntry({ crag, sector, workspace, topoSession });

	if (workspace.startsWith('/topos/3d') && !loadedTopo) {
		const draftId = await persistTopoSessionImmediately(topoSession, snapshot);
		goto(`${resolve('/topos/3d/upload')}?draft=${encodeURIComponent(draftId)}`);
		return;
	}

	await persistTopoSessionImmediately(topoSession, snapshot);
	goto(`${resolve(workspace)}?draft=${encodeURIComponent(topoSession.ui.activeDraftId)}`);
}
