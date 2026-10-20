import type { SharedDraft } from '$lib/state/shared-draft';
import { workspaceNodes } from '$lib/state/shared-draft';
import { writeFile, writeJson } from '$lib/api/felslager';
import { getReview, deleteReview } from '$lib/api/reviews';
import { saveCragWorkspace } from './save-crag-workspace';
import { publishTopoDocument } from './publish-draft-assets';
import { workspaceNodeDocumentPaths } from './workspace-paths';

/** The caller persists the mutated draft in finally, including partially completed saves. */
export async function publishReview(
	draft: SharedDraft,
	persist: () => Promise<void>
): Promise<boolean> {
	if (!draft.reviewId) throw new Error('This draft is not linked to a review');
	if (!draft.reviewProductionSaved) {
		await getReview(draft.reviewId);
		await saveCragWorkspace(draft.workspace, {
			write: (path, data) =>
				path.endsWith('-topo.json')
					? publishTopoDocument(path, data as NonNullable<SharedDraft['workspace']['topo']>)
					: writeJson(path, data)
		});
		for (const node of workspaceNodes(draft.workspace)) {
			const context = draft.contexts[node.clientId!];
			if (!context?.glbBlob) continue;
			await writeFile(
				node.modelPath || workspaceNodeDocumentPaths(node).model,
				context.glbBlob,
				'model/gltf-binary'
			);
		}
		draft.reviewProductionSaved = true;
		await persist();
	}
	await deleteReview(draft.reviewId);
	delete draft.reviewId;
	delete draft.reviewProductionSaved;
	return true;
}
