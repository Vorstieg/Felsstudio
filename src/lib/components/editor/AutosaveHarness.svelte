<script lang="ts">
	import { untrack } from 'svelte';
	import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte';
	import { createCragEditorSession } from '$lib/state/crag-session.svelte';
	import { useDraftEditor, topoDraftAdapter, cragDraftAdapter } from './use-draft-editor.svelte';
	let {
		mode = '2d',
		entryPath = null
	}: {
		mode?: '2d' | '3d' | 'crag';
		entryPath?: string | null;
	} = $props();
	const topo = createTopo2DEditorState();
	const crag = createCragEditorSession();
	const initial = untrack(() => ({ mode, entryPath }));
	const draft = useDraftEditor({
		mode: initial.mode,
		entryPath: initial.entryPath,
		adapter: initial.mode === 'crag' ? cragDraftAdapter(crag) : topoDraftAdapter(topo, initial.mode)
	});
</script>

<button disabled={!draft.ready} data-testid="save" onclick={() => draft.flush().catch(() => {})}
	>Save</button
>
<input
	aria-label="Description"
	value={topo.topo.description || ''}
	oninput={(event) => (topo.topo.description = event.currentTarget.value)}
/>
<output data-testid="draft-id">{draft.id || ''}</output>
<output data-testid="node-id">{draft.nodeId || ''}</output>
<output data-testid="name">{crag.getActiveEntry()?.properties.name || topo.ui.name}</output>
<output role="alert">{draft.error}</output>

{#if mode === 'crag'}
	<button
		data-testid="select-child"
		onclick={() => {
			crag.activeWorkspaceEntryPath = 'new-crag/child';
		}}>Select child</button
	>
	<button
		data-testid="switch"
		onclick={() => {
			window.location.hash = draft.href('topos/2d/editor');
		}}>Switch</button
	>
{/if}
