import { fileUrl, writeFile, writeJson } from '$lib/api/felslager';
import { draftsState } from '$lib/state/drafts.svelte';
import { workspaceNodes } from '$lib/state/shared-draft';
import { workspaceNodeDocumentPaths } from './workspace-paths';
import type { Topo2DEditorDocument } from '$lib/state/topo-2d-editor-initial-state';
import type { FelsTopoDocument } from '@vorstieg/fels-types/types';

/** Preview URLs belong to the browser and must never be written into production JSON. */
export async function publishTopoDocument(
	path: string,
	topo: FelsTopoDocument | Topo2DEditorDocument
) {
	const document = { ...topo };
	if (document.image2D?.startsWith('blob:')) {
		const response = await fetch(document.image2D);
		if (!response.ok) throw new Error('Could not read the topo background');
		const blob = await response.blob();
		const extension =
			({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' } as Record<string, string>)[
				blob.type
			] || 'png';
		const imagePath = path.replace(/-topo\.json$/, `-background.${extension}`);
		await writeFile(imagePath, blob, blob.type);
		document.image2D = fileUrl(imagePath);
	}
	return writeJson(path, document);
}

/** Crag publishing also includes models added in the 3D editor. */
export async function publishDraftModels(id: string) {
	const draft = await draftsState.get(id);
	if (!draft) throw new Error('Draft not found');
	for (const node of workspaceNodes(draft.workspace)) {
		const model = draft.contexts[node.clientId!]?.glbBlob;
		if (!model) continue;
		const path = node.modelPath || workspaceNodeDocumentPaths(node).model;
		await writeFile(path, model, 'model/gltf-binary');
	}
}
