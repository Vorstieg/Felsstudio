<script>
	import { useTopoDraftAutosave } from './use-topo-draft-autosave.svelte.js';

	let { blank = false } = $props();
	let session = $state({
		topo: { editorMode: '2d', routes: [] },
		ui: { activeDraftId: null, lastSaved: null },
		getSaveSession: () => ({ topo: session.topo, glbBlob: null })
	});
	$effect(() => {
		session.topo.routes = blank ? [] : [{ id: 'route-1' }];
	});
	const autosave = useTopoDraftAutosave({
		editorMode: '2d',
		getWorkspace: () => '2d-create',
		getSaveSignature: () => `${session.topo.routes.length}`,
		getExtra: () => ({ selectedRouteId: 'route-1' }),
		session
	});
</script>

<button data-testid="save" onclick={() => autosave.persistDraftImmediately()}>Save</button>
<output data-testid="draft-id">{session.ui.activeDraftId ?? ''}</output>
<output data-testid="last-saved">{session.ui.lastSaved ?? ''}</output>
