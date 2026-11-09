import { processingCropSource } from './processing-assets';
import { getProcessingResults, downloadResultFile } from '$lib/api/processing';
import {
	parse3DUploadProject,
	getUploadCameraPositions,
	getUploadModelTransform
} from '$lib/components/editor/wizard/parse-3d-upload-project';
import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte';
import { createDraft, createDraftResources, draftNode } from '$lib/state/shared-draft';
import { draftsState } from '$lib/state/drafts.svelte';
import { createFelsEntry } from '$lib/state/crag-session.svelte';
import { topoDraftAdapter } from '$lib/components/editor/use-draft-editor.svelte';
import { loadGlbIntoEditorState } from './gltf-loader';
import { workspaceNodePath } from './workspace-paths';

export function validateResultPath(path: string) {
	if (
		!path ||
		path.includes('\\') ||
		path.startsWith('/') ||
		path.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))
	)
		throw new Error('Invalid result file path');
	return path;
}
/** Only the model and metadata block opening the editor. Remaining files are resumable. */
export async function downloadProcessingBundle(id: string) {
	const manifest = await getProcessingResults(id);
	validateResultPath(manifest.entryPath);
	const files: Record<string, Blob> = Object.create(null);
	const paths = manifest.files.map((file) => validateResultPath(file.path));
	if (
		new Set(paths).size !== paths.length ||
		!paths.includes('model.glb') ||
		!paths.includes('project.json')
	)
		throw new Error('Invalid processing result manifest');
	await Promise.all(
		['model.glb', 'project.json'].map(async (path) => {
			files[path] = await downloadResultFile(id, path);
		})
	);
	const project = parse3DUploadProject(JSON.parse(await files['project.json'].text()));
	for (const hit of project.hits)
		if (!paths.includes(validateResultPath(hit.crop)))
			throw new Error(`Missing detection crop: ${hit.crop}`);
	return { manifest, files, project, pendingFiles: paths.filter((path) => !files[path]) };
}
export async function importProcessingResult(id: string, sourceId?: string | null) {
	const { manifest, files, project, pendingFiles } = await downloadProcessingBundle(id);
	const resources = createDraftResources();
	try {
		const stored = sourceId ? await draftsState.get(sourceId) : null;
		if (sourceId && !stored) throw new Error('Draft not found');
		const draft = stored ? resources.restore(stored) : createDraft('3d');
		const parent = draftNode(draft);
		if (stored && workspaceNodePath(parent) !== manifest.entryPath)
			throw new Error('Capture belongs to another entry');
		const resultId = `reconstruction-${crypto.randomUUID().slice(0, 8)}`;
		if (stored) {
			const node = {
				entry: createFelsEntry('sector', { id: resultId, name: project.name || resultId }),
				path: workspaceNodePath(parent),
				childEntries: [],
				topo: null,
				access: null,
				dirtyPaths: [],
				removedPaths: [],
				images: [],
				documentsLoaded: true,
				detailsLoaded: true,
				clientId: crypto.randomUUID()
			};
			node.entry.geometry = structuredClone(
				parent.entry?.geometry || { type: 'Point', coordinates: [0, 0] }
			);
			parent.childEntries.push(node);
			draft.activeNodeId = node.clientId;
		} else {
			// Keep a distinct publication path for every run, including repeated imports.
			parent.path = manifest.entryPath;
			parent.entry = createFelsEntry('sector', { id: resultId, name: project.name || resultId });
			parent.entry.geometry = { type: 'Point', coordinates: [0, 0] };
			parent.dirtyPaths = [];
			draft.placed = true;
		}
		const editor = createTopo2DEditorState();
		await loadGlbIntoEditorState(files['model.glb'], editor);
		editor.clustering.rawHits = project.hits;
		editor.clustering.cameraPositions = getUploadCameraPositions(project);
		Object.assign(editor.ui, getUploadModelTransform(project, editor.ui.modelOffset));
		editor.ui.name = project.name || resultId;
		for (const gps of project.gps) {
			const key = gps.frame_index ?? gps.img?.match(/[fF](\d+)/)?.[1];
			if (key !== undefined) editor.clustering.gpsData[key] = gps;
		}
		const gps = project.gps.find((value) => value.latitude !== 0 && value.longitude !== 0);
		if (gps) {
			editor.topo.coordinates = [gps.longitude, gps.latitude, gps.abs_alt || gps.rel_alt || 0];
			draftNode(draft).entry!.geometry = {
				type: 'Point',
				coordinates: [gps.longitude, gps.latitude]
			};
		}
		const crops: Record<string, string> = {};
		for (const hit of project.hits) {
			const url = processingCropSource(id, hit.crop);
			crops[hit.crop] = url;
			crops[hit.crop.toLowerCase()] = url;
		}
		editor.clustering.cropsMap = crops;
		topoDraftAdapter(editor, '3d').capture(draft);
		const node = draftNode(draft);
		node.dirtyPaths.push(`${workspaceNodePath(node)}/${node.entry!.properties.id}.json`);
		draft.processingImports ||= {};
		draft.processingImports[draft.activeNodeId] = {
			processingId: id,
			captureId: manifest.captureId,
			entryPath: manifest.entryPath,
			engine: manifest.engine,
			files,
			pendingFiles
		};
		draft.lastEditor = '3d';
		await draftsState.save(draft);
		return { id: draft.id, nodeId: draft.activeNodeId };
	} finally {
		resources.release();
	}
}
