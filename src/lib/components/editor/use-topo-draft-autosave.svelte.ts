import { onMount } from 'svelte';
import { draftsState, isBlankTopoSession } from '$lib/state/drafts.svelte.ts';
import { resolveTopoSavePath } from '$lib/assets/js/topo-save-path.ts';
import type {
	DraftEditorExtras,
	DraftSession,
	DraftTopoData
} from '$lib/state/draft-serialization.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';

type TopoSession = ReturnType<typeof createTopo2DEditorState>;
type SaveSession = DraftEditorExtras & { topo: DraftTopoData };
type AutosaveOptions = {
	editorMode: '2d' | '3d';
	getWorkspace: () => string;
	getSaveSignature: () => unknown;
	restoreSession: (session: DraftSession, id: string) => void;
	shouldRestore?: (() => boolean) | null;
	delay?: number;
	session: TopoSession;
	draftId?: string | null;
	entryPath?: string | null;
	loadEntrySession?: ((path: string) => boolean | void | Promise<boolean | void>) | null;
	getSaveSession?: (() => SaveSession) | null;
	onPersisted?: (() => void) | null;
	onInitialized?: (() => void) | null;
};

function setDraftParamInUrl(id: string | null) {
	if (!id || typeof window === 'undefined') return;
	const url = new URL(window.location.href);
	if (url.searchParams.get('draft') === id) return;
	url.searchParams.set('draft', id);
	window.history.replaceState(window.history.state, '', url);
}

/**
 * Adds the common local-draft lifecycle used by topo editors. Saving a draft is
 * intentionally separate from publishing/exporting a topo file.
 */
export function useTopoDraftAutosave({
	editorMode,
	getWorkspace,
	getSaveSignature,
	restoreSession,
	shouldRestore = null,
	delay = 2000,
	session,
	draftId = null,
	entryPath = null,
	loadEntrySession = null,
	getSaveSession = null,
	onPersisted = null,
	onInitialized = null
}: AutosaveOptions) {
	if (!session) throw new Error('A topo editor session is required for draft autosave');
	const topoSession = session;
	let canAutosave = $state(false);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	let isPersisting = false;
	let saveAgain = false;
	const currentSession = () => $state.snapshot(getSaveSession?.() || topoSession.getSaveSession());

	async function persistDraftImmediately({ allowBlank = false }: { allowBlank?: boolean } = {}) {
		let saveSession = currentSession();
		if (!allowBlank && isBlankTopoSession(saveSession)) return;
		if (isPersisting) {
			saveAgain = true;
			return;
		}

		isPersisting = true;
		try {
			do {
				saveAgain = false;
				const { topo, ...extras } = saveSession;
				topoSession.ui.activeDraftId = await draftsState.save(topo, topoSession.ui.activeDraftId, {
					...extras,
					editorMode
				});
				setDraftParamInUrl(topoSession.ui.activeDraftId);
				topoSession.ui.lastSaved = new Date().toISOString();
				onPersisted?.();
				if (saveAgain) {
					saveSession = currentSession();
					if (!allowBlank && isBlankTopoSession(saveSession)) break;
				}
			} while (saveAgain);
		} finally {
			isPersisting = false;
		}
	}

	onMount(() => {
		let disposed = false;
		const persistOnHide = () => {
			if (document.visibilityState === 'hidden') void persistDraftImmediately();
		};

		void (async () => {
			draftsState.load();
			let initialized = true;
			let loadedFromEntry = false;
			if (!topoSession.ui.activeDraftId && draftId) {
				const requested = await draftsState.getById(draftId);
				if (!disposed && requested) {
					restoreSession(requested, draftId);
					setDraftParamInUrl(draftId);
				}
			} else if (!topoSession.ui.activeDraftId && entryPath) {
				if (!disposed && loadEntrySession) {
					initialized = (await loadEntrySession(entryPath)) !== false;
					loadedFromEntry = initialized;
				}
			} else if (
				!topoSession.ui.activeDraftId &&
				(shouldRestore ? shouldRestore() : isBlankTopoSession(currentSession()))
			) {
				const latest = await draftsState.getLatest(editorMode);
				if (!disposed && latest?.session) {
					restoreSession(latest.session, latest.id);
					setDraftParamInUrl(latest.id);
				}
			}
			if (disposed || !initialized) return;
			const topoFileName = resolveTopoSavePath(topoSession.ui, entryPath);
			if (topoFileName) {
				topoSession.ui.topoFileName = topoFileName;
				topoSession.ui.entryPath ||= topoFileName.replace(/-topo\.json$/, '');
			}
			topoSession.ui.editorMode = editorMode;
			topoSession.ui.workspace = getWorkspace();
			onInitialized?.();
			if (loadedFromEntry) await persistDraftImmediately({ allowBlank: true });
			if (disposed) return;
			canAutosave = true;
		})();

		document.addEventListener('visibilitychange', persistOnHide);
		window.addEventListener('pagehide', persistOnHide);
		return () => {
			disposed = true;
			if (saveTimeout !== null) clearTimeout(saveTimeout);
			document.removeEventListener('visibilitychange', persistOnHide);
			window.removeEventListener('pagehide', persistOnHide);
		};
	});

	$effect(() => {
		getSaveSignature();
		if (!canAutosave || isBlankTopoSession(currentSession())) return;
		if (saveTimeout !== null) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => void persistDraftImmediately(), delay);
	});

	return { persistDraftImmediately };
}
