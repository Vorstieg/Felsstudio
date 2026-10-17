import { getContext, onMount, setContext } from 'svelte';
import { beforeNavigate, goto } from '$app/navigation';
import { base } from '$app/paths';
import { draftsState } from '$lib/state/drafts.svelte';
import {
	createDraft,
	createDraftResources,
	draftNode,
	workspaceNodes,
	type EditorMode,
	type SharedDraft
} from '$lib/state/shared-draft';
import { workspaceNodeDocumentPaths, workspaceNodePath } from '$lib/assets/js/workspace-paths';
import { loadCragEditorEntry } from '$lib/assets/js/load-crag-editor-entry';
import { fileUrl } from '$lib/api/felslager';
import { initializeIdCounters } from '$lib/assets/js/id-utils';
import { loadGlbIntoEditorState } from '$lib/assets/js/gltf-loader';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte';
import type { FelsEntryWorkspace, CragEditorSession } from '$lib/types/crag';

export type DraftAdapter = {
	load(draft: SharedDraft): void | Promise<void>;
	capture(draft: SharedDraft): void;
	signature(): unknown;
};
export function topoDraftAdapter(
	editor: ReturnType<typeof createTopo2DEditorState>,
	mode: '2d' | '3d'
): DraftAdapter {
	return {
		async load(draft) {
			const node = draftNode(draft);
			const context = draft.contexts[node.clientId!] || {};
			const paths = draft.placed ? workspaceNodeDocumentPaths(node) : null;
			node.topo ||= { routes: [] };
			if (!node.topo.image2D) {
				const names = [
					`${node.entry?.properties.name}.jpg`,
					`${node.entry?.properties.name}.png`,
					'topo.jpg'
				];
				const image = (node.auxiliaryFiles || []).find((path) =>
					names.includes(path.split('/').at(-1)!)
				);
				if (image) node.topo.image2D = fileUrl(image);
			}
			let model = context.glbBlob;
			if (!model && mode === '3d' && node.modelPath) {
				const response = await fetch(fileUrl(node.modelSourcePath || node.modelPath));
				if (!response.ok) throw new Error('Could not load the entry model');
				model = await response.blob();
			}
			editor.loadSession({
				...context,
				topo: node.topo,
				editorMode: mode,
				name: context.name || node.entry?.properties.name || draft.name,
				glbBlob: model,
				topoFileName: paths?.topo,
				entryPath: paths?.topo.replace(/-topo\.json$/, ''),
				has3DTopoAvailable: !!model || !!node.modelPath
			});
			if (model && !context.modelOffset && mode === '3d')
				await loadGlbIntoEditorState(model, editor);
			initializeIdCounters(editor.topo);
		},
		capture(draft) {
			const node = draftNode(draft);
			node.topo = editor.getSaveSnapshot() as FelsEntryWorkspace['topo'];
			const {
				topo: _topo,
				entryPath: _path,
				topoFileName: _file,
				editorMode: _mode,
				...context
			} = editor.getSaveSession();
			draft.contexts[node.clientId!] = context;
			draft.name = context.name || node.entry?.properties.name || 'Unnamed draft';
			const path = workspaceNodeDocumentPaths(node).topo;
			if (!node.dirtyPaths.includes(path)) node.dirtyPaths.push(path);
		},
		signature: () =>
			JSON.stringify({
				...editor.getSaveSession(),
				topo: editor.getSaveSnapshot(),
				modelRevision: editor.transient.modelRevision
			})
	};
}
export function cragDraftAdapter(editor: CragEditorSession): DraftAdapter {
	return {
		load(draft) {
			editor.workspace = draft.workspace;
			const path = workspaceNodePath(draftNode(draft));
			editor.activeWorkspaceEntryPath = path;
			editor.activeMetadataTarget =
				draft.lastEditor === 'crag' ? draft.activeMetadataTarget || path : path;
			for (const node of workspaceNodes(draft.workspace))
				for (const image of [...(node.pendingImages || [])])
					if (image) editor.addPendingImage(node, image);
		},
		capture(draft) {
			draft.workspace = editor.workspace!;
			for (const node of workspaceNodes(draft.workspace)) {
				node.clientId ||= crypto.randomUUID();
				if (draft.contexts[node.clientId])
					draft.contexts[node.clientId].name = node.entry?.properties.name;
			}
			draft.activeNodeId = editor.getActiveWorkspaceEntry()!.clientId!;
			draft.activeMetadataTarget = editor.activeMetadataTarget;
			draft.name = editor.getActiveEntry()?.properties.name || 'Unnamed draft';
			draft.placed = true;
		},
		signature: () =>
			JSON.stringify({
				workspace: editor.workspace,
				active: editor.activeWorkspaceEntryPath,
				metadata: editor.activeMetadataTarget
			})
	};
}

/** One lifecycle for every editing surface, including model upload. */
export function useDraftEditor({
	mode,
	adapter,
	entryPath,
	resume = mode !== 'crag',
	onReady
}: {
	mode: EditorMode;
	adapter: DraftAdapter;
	entryPath?: string | null;
	resume?: boolean;
	onReady?: () => void | Promise<void>;
}) {
	let draft = $state<SharedDraft | null>(null);
	let ready = $state(false);
	let error = $state('');
	let navigating = $state(false);
	let bypass = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const resources = createDraftResources();
	const fail = (cause: unknown) => {
		error = cause instanceof Error ? cause.message : String(cause);
	};
	async function flush() {
		clearTimeout(timeout);
		if (!ready || !draft) throw new Error('Draft is still loading');
		adapter.capture(draft);
		draft.lastEditor = mode;
		await draftsState.save(draft);
		error = '';
	}
	const controller = {
		mode,
		get id() {
			return draft?.id || null;
		},
		get nodeId() {
			return draft?.activeNodeId || null;
		},
		get ready() {
			return ready;
		},
		get error() {
			return error;
		},
		get busy() {
			return navigating;
		},
		flush,
		href(route: string) {
			adapter.capture(draft!);
			return `${base}/${route}?draft=${encodeURIComponent(draft!.id)}&node=${encodeURIComponent(draft!.activeNodeId)}`;
		}
	};
	onMount(() => {
		let disposed = false;
		void (async () => {
			const url = new URL(window.location.href);
			let id = url.searchParams.get('draft');
			if (!id && !entryPath && resume) {
				await draftsState.load();
				id = draftsState.drafts.find((item) => item.lastEditor === mode)?.id || null;
			}
			const source = !id && entryPath ? await loadCragEditorEntry(entryPath) : null;
			if (entryPath && !id && !source) throw new Error('Entry not found');
			const stored = id ? await draftsState.get(id) : null;
			if (id && !stored) throw new Error('Draft not found');
			if (disposed) return;
			draft = stored ? resources.restore(stored) : createDraft(mode, source);
			draft.activeNodeId = url.searchParams.get('node') || draft.activeNodeId;

			await adapter.load(draft);
			if (disposed) return;
			ready = true;
			if (!stored) await flush();
			url.searchParams.set('draft', draft.id);
			url.searchParams.set('node', draft.activeNodeId);
			window.history.replaceState(window.history.state, '', url);
			await onReady?.();
		})().catch(fail);
		const onHide = () => {
			if (ready && document.visibilityState === 'hidden') void flush().catch(fail);
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', onHide);
		return () => {
			disposed = true;
			clearTimeout(timeout);
			resources.release();
			document.removeEventListener('visibilitychange', onHide);
			window.removeEventListener('pagehide', onHide);
		};
	});
	$effect(() => {
		if (!ready) return;
		adapter.signature();
		clearTimeout(timeout);
		timeout = setTimeout(() => void flush().catch(fail), 2000);
	});
	beforeNavigate((navigation) => {
		if (bypass) {
			bypass = false;
			return;
		}
		if (!ready || navigation.willUnload || !navigation.to) return;
		navigation.cancel();
		if (navigating) return;
		navigating = true;
		error = '';
		void flush()
			.then(() => {
				bypass = true;
				return goto(navigation.to!.url, { replaceState: navigation.type === 'popstate' });
			})
			.catch((cause) => {
				bypass = false;
				fail(cause);
			})
			.finally(() => {
				navigating = false;
			});
	});
	setContext(draftEditorKey, controller);
	return controller;
}
export type DraftController = ReturnType<typeof useDraftEditor>;

const draftEditorKey = Symbol('draft-editor');
export const getDraftEditor = () => getContext<DraftController | undefined>(draftEditorKey);
