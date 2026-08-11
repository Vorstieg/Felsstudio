import { onMount } from 'svelte';
import { draftsState, isBlankTopoSession } from '$lib/state/drafts.svelte.js';

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
	getSaveSession = null,
	onPersisted = null
}) {
	if (!session) throw new Error('A topo editor session is required for draft autosave');
	/** @type {ReturnType<typeof import('$lib/state/topo-2d-editor-state.svelte.js').createTopo2DEditorState>} */
	const topoSession = session;
	let canAutosave = $state(false);
	let saveTimeout = null;
	let isPersisting = false;
	let saveAgain = false;
	const currentSession = () => getSaveSession?.() || topoSession.getSaveSession();

	async function persistDraftImmediately() {
		if (isBlankTopoSession(currentSession())) return;
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
			if (!topoSession.ui.activeDraftId && draftId) {
				const requested = await draftsState.getById(draftId);
				if (!disposed && requested) restoreSession(requested, draftId);
			} else if (
				!topoSession.ui.activeDraftId &&
				(shouldRestore ? shouldRestore() : isBlankTopoSession(currentSession()))
			) {
				const latest = await draftsState.getLatest(editorMode);
				if (!disposed && latest) restoreSession(latest.session, latest.id);
			}
			if (disposed) return;
			topoSession.topo.editorMode = editorMode;
			topoSession.ui.workspace = getWorkspace();
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
