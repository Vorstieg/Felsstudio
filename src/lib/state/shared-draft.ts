import { createFelsEntry } from './crag-session.svelte';
import type { FelsEntryWorkspace, FelsEntryWorkspaceSnapshot } from '$lib/types/crag';
import type { TopoSessionInput } from './topo-2d-editor-state.svelte';
import { workspaceNodePath } from '$lib/assets/js/workspace-paths';

export type EditorMode = 'crag' | '2d' | '3d';
export type SharedDraft = {
	id: string;
	name: string;
	updated: string;
	lastEditor: EditorMode;
	activeNodeId: string;
	activeMetadataTarget: string | null;
	placed: boolean;
	workspace: FelsEntryWorkspace;
	contexts: Record<string, Omit<TopoSessionInput, 'topo'>>;
	media: Record<string, { background?: Blob; crops: Record<string, Blob> }>;
};
export function workspaceNodes<T extends { childEntries: T[] }>(root: T): T[] {
	return [root, ...root.childEntries.flatMap(workspaceNodes<T>)];
}
export function draftNode(draft: SharedDraft) {
	const node = workspaceNodes(draft.workspace).find((node) => node.clientId === draft.activeNodeId);
	if (!node) throw new Error('Entry not found in draft');
	return node;
}
export function createDraft(
	mode: EditorMode,
	source?: FelsEntryWorkspaceSnapshot | null
): SharedDraft {
	const workspace = source?.workspace || {
		entry: createFelsEntry('crag', { id: 'new-crag', name: 'New Crag' }),
		path: '',
		childEntries: [],
		topo: null,
		access: null,
		dirtyPaths: ['new-crag/new-crag.json'],
		removedPaths: [],
		images: [],
		documentsLoaded: true,
		detailsLoaded: true
	};
	for (const node of workspaceNodes(workspace)) node.clientId ||= crypto.randomUUID();
	const active =
		workspaceNodes(workspace).find(
			(node) => workspaceNodePath(node) === source?.activeWorkspaceEntryPath
		) || workspace;
	return {
		id: crypto.randomUUID(),
		name: active.entry?.properties.name || 'Unnamed draft',
		updated: '',
		lastEditor: mode,
		activeNodeId: active.clientId!,
		activeMetadataTarget: source?.activeMetadataTarget || workspaceNodePath(active),
		placed: !!source || mode === 'crag',
		workspace,
		contexts: {},
		media: {}
	};
}

async function localBlob(url: string | null | undefined) {
	if (!url || !(url.startsWith('blob:') || url.startsWith('data:image/'))) return undefined;
	const response = await fetch(url);
	if (!response.ok) throw new Error('Could not save a draft asset');
	return response.blob();
}
/** Encode a plain snapshot once, at the IndexedDB boundary. Text is never interpreted as an asset. */
export async function encodeDraft(draft: SharedDraft) {
	const nodes = workspaceNodes(draft.workspace);
	const ids = new Set(nodes.map((node) => node.clientId));
	for (const table of [draft.contexts, draft.media])
		for (const id of Object.keys(table)) if (!ids.has(id)) delete table[id];
	for (const node of nodes) {
		const media = {
			background: await localBlob(node.topo?.image2D),
			crops: {} as Record<string, Blob>
		};
		if (media.background && node.topo) node.topo.image2D = null;
		for (const image of node.pendingImages || []) if (image) image.previewUrl = '';
		const crops = draft.contexts[node.clientId!]?.clustering?.cropsMap || {};
		const blobs = new Map<string, Promise<Blob | undefined>>();
		for (const [key, url] of Object.entries(crops)) {
			if (!blobs.has(url)) blobs.set(url, localBlob(url));
			const blob = await blobs.get(url);
			if (blob) {
				media.crops[key] = blob;
				delete crops[key];
			}
		}
		draft.media[node.clientId!] = media;
	}
	return draft;
}
export function createDraftResources() {
	const urls = new Set<string>();
	const preview = (blob: Blob) => {
		const url = URL.createObjectURL(blob);
		urls.add(url);
		return url;
	};
	return {
		restore(stored: SharedDraft): SharedDraft {
			const draft = structuredClone(stored);
			for (const node of workspaceNodes(draft.workspace)) {
				const media = draft.media[node.clientId!];
				if (media?.background && node.topo) node.topo.image2D = preview(media.background);
				for (const image of node.pendingImages || [])
					if (image) image.previewUrl = preview(image.file);
				const crops = draft.contexts[node.clientId!]?.clustering?.cropsMap;
				if (crops)
					for (const [key, blob] of Object.entries(media?.crops || {})) crops[key] = preview(blob);
			}
			return draft;
		},
		release() {
			for (const url of urls) URL.revokeObjectURL(url);
			urls.clear();
		}
	};
}
