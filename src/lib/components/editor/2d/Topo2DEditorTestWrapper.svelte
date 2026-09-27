<script lang="ts">
	import type { Topo2DEditorDocument } from '$lib/state/topo-2d-editor-initial-state.ts';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import Topo2DEditor from './Topo2DEditor.svelte';

	let {
		topo,
		activeTool = 'select'
	}: { topo: Partial<Topo2DEditorDocument>; activeTool?: string } = $props();
	const editorState = provideTopo2DEditorState(createTopo2DEditorState());
	// svelte-ignore state_referenced_locally
	editorState.loadSession({ topo });
	// svelte-ignore state_referenced_locally
	editorState.setActiveTool(activeTool);
</script>

<Topo2DEditor {editorState} />
