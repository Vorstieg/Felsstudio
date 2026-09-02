<script>
	import { untrack } from 'svelte';
	import { useTopoDraftAutosave } from './use-topo-draft-autosave.svelte.js';

	let {
		blank = false,
		draftId = null,
		entryPath = null,
		loadEntrySession = null,
		restoreSession = null
	} = $props();
	let session = $state({
		topo: { editorMode: '2d', routes: [] },
		ui: { activeDraftId: null, lastSaved: null },
		getSaveSession: () => ({ topo: session.topo, glbBlob: null })
	});
	$effect(() => {
		session.topo.routes = blank ? [] : [{ id: 'route-1' }];
	});

	const initial = untrack(() => ({
		draftId,
		entryPath,
		loadEntrySession,
		restoreSession
	}));
	const autosave = useTopoDraftAutosave({
		editorMode: '2d',
		draftId: initial.draftId,
		entryPath: initial.entryPath,
		loadEntrySession: initial.loadEntrySession,
		restoreSession:
			initial.restoreSession ||
			((draft, id) => {
				session.topo = draft.topo;
				session.ui.activeDraftId = id;
			}),
		getWorkspace: () => '2d-create',
		getSaveSignature: () => `${session.topo.routes.length}`,
		getExtra: () => ({ selectedRouteId: 'route-1' }),
		session
	});
</script>

<button data-testid="save" onclick={() => autosave.persistDraftImmediately()}>Save</button>
<output data-testid="draft-id">{session.ui.activeDraftId ?? ''}</output>
<output data-testid="last-saved">{session.ui.lastSaved ?? ''}</output>
