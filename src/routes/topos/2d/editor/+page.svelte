<script>
	import ToolPalette2D from '$lib/components/editor/2d/ToolPalette2D.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
	import { useTopoDraftAutosave } from '$lib/components/editor/use-topo-draft-autosave.svelte.js';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import Topo2DEditor from '$lib/components/editor/2d/Topo2DEditor.svelte';
	import OutlineToolOptions from '$lib/components/editor/tools/OutlineToolOptions.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import { authState } from '$lib/api/auth.svelte.js';
	import { writeJson } from '$lib/api/felslager.js';

	let activeTool = $state(null);
	let selectedOutlineStyle = $state('rock');
	let drawingTarget = $state(null);
	let hasPendingChanges = $state(false);
	let showMapModal = $state(false);
	let editor2D = $state();
	let saveStatus = $state();
	let saveError = $state();

	useTopoDraftAutosave({
		editorMode: '2d',
		getWorkspace: () => 'topos/2d/editor',
		restoreSession: (session, id) => {
			userState.reset();
			userState.topo = session.topo || session;
			userState.ui.activeDraftId = id;
			initializeIdCounters(userState.topo);
		},
		getSaveSignature: () => JSON.stringify(userState.topo)
	});

	async function saveTopo() {
		// Require authentication
		if (!authState.requireAuth(() => saveTopo())) return;

		try {
			userState.topo.date = userState.topo.date || new Date().toISOString().split('T')[0];
			userState.topo.updated = new Date().toISOString().split('T')[0];

			let topoToSave = JSON.parse(JSON.stringify(userState.topo));

			// Remove internal UI fields before saving
			delete topoToSave._entryPath;
			delete topoToSave._topoFileName;

			await writeJson(userState.topo._topoFileName, topoToSave);

			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (err) {
			console.error('Save failed:', err);
			saveStatus = 'error';
			saveError = err.message;
		}
	}
</script>

<Topo2DEditor
	bind:this={editor2D}
	bind:activeTool
	bind:drawingTarget
	selectedSymbol={userState.ui.selectedSymbol}
	{selectedOutlineStyle}
	bind:hasPendingChanges
/>

<ToolPalette2D
	bind:activeTool
	bind:selectedSymbol={userState.ui.selectedSymbol}
	bind:selectedOutlineStyle
	{hasPendingChanges}
	onFinishRoute={() => editor2D.finalize()}
	onCancelAction={() => editor2D.cancel()}
	onUndo={() => editor2D?.undo()}
	onRedo={() => editor2D?.redo()}
	onExport={saveTopo}
	status={saveStatus}
	errorMessage={saveError}
/>
{#if ['route', 'multipitch', 'outline'].includes(activeTool)}
	<div class="fixed bottom-16 left-2 right-2 z-101 md:bottom-auto md:right-auto md:top-25">
		<OutlineToolOptions
			outlineTool={editor2D?.getCurrentTool?.()}
			{activeTool}
			bind:selectedOutlineStyle
			onFinalize={() => editor2D.finalize()}
			onCancelAction={() => editor2D.cancel()}
			onClose={() => (activeTool = null)}
		/>
	</div>
{/if}

<TopoPropertiesPanel bind:showMapModal bind:drawingTarget bind:activeTool />
