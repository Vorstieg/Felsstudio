import { fileUrl, readJson } from '$lib/api/felslager.ts';
import { draftsState } from '$lib/state/drafts.svelte.ts';
import { Topo } from '$lib/assets/js/topo-paths.ts';
import { initializeIdCounters } from '$lib/assets/js/id-utils.ts';
import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.ts';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.ts';
import { splitEntryPath } from '$lib/assets/js/editor-entry-paths.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { DraftClustering } from '$lib/state/draft-serialization.ts';
import type {
	Topo2DEditorClustering,
	Topo2DEditorDocument
} from '$lib/state/topo-2d-editor-initial-state.ts';

type TopoEditorSession = ReturnType<typeof createTopo2DEditorState>;

type LoadTopoEditorEntryOptions = {
	entryPath: string;
	workspace: string;
	topoSession: TopoEditorSession;
};

export async function persistTopoSessionImmediately(
	topoSession: TopoEditorSession,
	snapshot: (value: Topo2DEditorClustering) => Topo2DEditorClustering = (value) => value
): Promise<string> {
	draftsState.load();
	const clustering = snapshot(topoSession.clustering);
	const draftClustering: DraftClustering = {
		...clustering,
		cropsMap: Object.fromEntries(
			Object.entries(clustering.cropsMap).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		)
	};
	topoSession.ui.activeDraftId = await draftsState.save(
		topoSession.topo,
		topoSession.ui.activeDraftId,
		{
			clustering: draftClustering,
			glbBlob: topoSession.transient.glbBlob
		}
	);
	topoSession.ui.lastSaved = new Date().toISOString();
	return topoSession.ui.activeDraftId;
}

function getCragDirectory(topo: Topo): string {
	return [topo.path, topo.cragId].filter(Boolean).join('/');
}

export async function loadTopoEditorEntry({
	entryPath,
	workspace,
	topoSession
}: LoadTopoEditorEntryOptions): Promise<{ loadedTopo: boolean; topo: Topo }> {
	topoSession.reset();
	const splitPath = splitEntryPath(entryPath);
	const topo = new Topo(splitPath.path, splitPath.id);
	let name = splitPath.id;
	try {
		const cragData = await readJson<{ properties?: { name?: string } }>(topo.getCragPath());
		name = cragData.properties?.name ?? name;
	} catch {
		/* crag file may not exist */
	}
	let loadedTopo = false;

	if (workspace.startsWith('/topos/2d')) {
		try {
			topoSession.topo = {
				...topoSession.topo,
				...normalizeTopoPaths(await readJson<Topo2DEditorDocument>(topo.getTopoPath())).data
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
			const topoData = normalizeTopoPaths(
				await readJson<Topo2DEditorDocument>(topo.getTopoPath())
			).data;
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
