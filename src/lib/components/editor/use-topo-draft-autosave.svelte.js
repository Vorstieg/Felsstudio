import { onMount } from 'svelte';
import { draftsState, isBlankTopoSession } from '$lib/state/drafts.svelte.js';

function setDraftParamInUrl(id) {
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
	getExtra = () => ({}),
	shouldRestore = null,
	delay = 2000,
	session,
	draftId = null,
	entryPath = null,
	loadEntrySession = null,
	getSaveSession = null,
	onPersisted = null,
	onInitialized = null
}) {
	if (!session) throw new Error('A topo editor session is required for draft autosave');
	/** @type {ReturnType<typeof import('$lib/state/topo-2d-editor-state.svelte.js').createTopo2DEditorState>} */
	const topoSession = session;
	let canAutosave = $state(false);
	let saveTimeout = null;
	let isPersisting = false;
	let saveAgain = false;
	const currentSession = () => getSaveSession?.() || topoSession.getSaveSession();

	async function persistDraftImmediately({ allowBlank = false } = {}) {
		if (!allowBlank && isBlankTopoSession(currentSession())) return;
		if (isPersisting) {
			saveAgain = true;
			return;
		}

		isPersisting = true;
		try {
			do {
				saveAgain = false;
				topoSession.ui.activeDraftId = await draftsState.save(
					topoSession.topo,
					topoSession.ui.activeDraftId,
					getExtra()
				);
				setDraftParamInUrl(topoSession.ui.activeDraftId);
				topoSession.ui.lastSaved = new Date().toISOString();
				onPersisted?.();
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
				if (!disposed && latest) {
					restoreSession(latest.session, latest.id);
					setDraftParamInUrl(latest.id);
				}
			}
			if (disposed || !initialized) return;
			topoSession.topo.editorMode = editorMode;
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
			clearTimeout(saveTimeout);
			document.removeEventListener('visibilitychange', persistOnHide);
			window.removeEventListener('pagehide', persistOnHide);
		};
	});

	$effect(() => {
		getSaveSignature();
		if (!canAutosave || isBlankTopoSession(currentSession())) return;
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => void persistDraftImmediately(), delay);
	});

	return { persistDraftImmediately };
}
