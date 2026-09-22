import type { FelsEntryWorkspace } from '$lib/types/crag';
import { Topo } from './topo-paths.js';

type WorkspaceNodeLocation = Pick<FelsEntryWorkspace, 'path' | 'id' | 'entry'>;

export function workspaceEntryPath(path: string, id: string): string {
	return [path, id]
		.filter(Boolean)
		.join('/')
		.replace(/^\/+|\/+$/g, '');
}

export function workspaceNodePath(node: WorkspaceNodeLocation): string {
	return workspaceEntryPath(node.path, String(node.entry?.properties.id || node.id || ''));
}

export function workspaceDocumentPaths(path: string, id: string) {
	const topo = new Topo(path, id);
	return {
		entry: topo.getCragPath(),
		topo: topo.getTopoPath(),
		access: topo.getAccessPath(),
		model: topo.getGlbPath()
	};
}

/** Files already in a moved directory may still use its previous ID. */
export function workspaceDocumentPathsAt(directory: string, fileId: string) {
	const stem = `${directory}/${fileId}`;
	return {
		entry: `${stem}.json`,
		topo: `${stem}-topo.json`,
		access: `${stem}-access.json`,
		model: `${stem}.glb`
	};
}

export function workspaceNodeDocumentPaths(node: WorkspaceNodeLocation) {
	return workspaceDocumentPaths(node.path, String(node.entry?.properties.id || node.id || ''));
}
