import { fileUrl, readJson } from '$lib/api/felslager.ts';
import { draftsState } from '$lib/state/drafts.svelte.ts';
import { Topo } from '$lib/assets/js/topo-paths.ts';
import { initializeIdCounters } from '$lib/assets/js/id-utils.ts';
import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader.ts';
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
	const { topo, ...extras } = topoSession.getSaveSession();
	topoSession.ui.activeDraftId = await draftsState.save(topo, topoSession.ui.activeDraftId, {
		...extras,
		clustering: draftClustering
	});
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
			topoSession.topo = await readJson<Topo2DEditorDocument>(topo.getTopoPath());
		} catch {
			/* no topo yet */
		}
		topoSession.ui.editorMode = '2d';
		try {
			const modelResponse = await fetch(fileUrl(topo.getGlbPath()));
			topoSession.ui.has3DTopoAvailable = modelResponse.ok;
			await modelResponse.body?.cancel();
		} catch {
			topoSession.ui.has3DTopoAvailable = false;
		}

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
			topoSession.topo = await readJson<Topo2DEditorDocument>(topo.getTopoPath());
			initializeIdCounters(topoSession.topo);
		} catch {
			/* no topo yet */
		}

		topoSession.ui.editorMode = '3d';
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

	topoSession.ui.entryPath = topo._getPath();
	topoSession.ui.topoFileName = topo.getTopoPath();

	return { loadedTopo, topo };
}
