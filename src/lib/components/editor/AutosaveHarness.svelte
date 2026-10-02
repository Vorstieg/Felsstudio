<script lang="ts">
	import { untrack } from 'svelte';
	import type { Route } from '@vorstieg/fels-types/types';
	import type { DraftSession } from '$lib/state/draft-serialization.ts';
	import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
	import { useTopoDraftAutosave } from './use-topo-draft-autosave.svelte.ts';

	type Props = {
		blank?: boolean;
		draftId?: string | null;
		entryPath?: string | null;
		loadEntrySession?: ((_path: string) => boolean | void | Promise<boolean | void>) | null;
		restoreSession?: ((_draft: DraftSession, _id: string) => void) | null;
		savedRoutes?: Route[] | null;
	};
	let {
		blank = false,
		draftId = null,
		entryPath = null,
		loadEntrySession = null,
		restoreSession = null,
		savedRoutes = null
	}: Props = $props();
	const session = createTopo2DEditorState();
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
		restoreSession: initial.restoreSession || ((draft, id) => session.loadSession(draft, id)),
		getWorkspace: () => '2d-create',
		getSaveSignature: () => `${session.topo.routes.length}`,
		getSaveSession: () => ({
			topo: { ...session.topo, routes: savedRoutes ?? session.topo.routes },
			glbBlob: null,
			selectedRouteId: 'route-1'
		}),
		session
	});
</script>

<button data-testid="save" onclick={() => autosave.persistDraftImmediately()}>Save</button>
<output data-testid="draft-id">{session.ui.activeDraftId ?? ''}</output>
<output data-testid="last-saved">{session.ui.lastSaved ?? ''}</output>
