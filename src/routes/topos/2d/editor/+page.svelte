<script>
	import ToolPalette2D from '$lib/components/editor/2d/ToolPalette2D.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
	import { useTopoDraftAutosave } from '$lib/components/editor/use-topo-draft-autosave.svelte.js';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import Topo2DEditor from '$lib/components/editor/2d/Topo2DEditor.svelte';
	import OutlineToolOptions from '$lib/components/editor/tools/OutlineToolOptions.svelte';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import { authState } from '$lib/api/auth.svelte.js';
	import { writeJson } from '$lib/api/felslager.js';
	import { topoSymbols } from '@vorstieg/topo-renderer';
	import { _ } from 'svelte-i18n';

	let activeTool = $state('select');
	let selectedOutlineStyle = $state('rock');
	let drawingTarget = $state(null);
	let hasPendingChanges = $state(false);
	let snapRoutesToFixpoints = $state(false);
	let showMapModal = $state(false);
	let editor2D = $state();
	let saveStatus = $state();
	let saveError = $state();
	let outlineSimplifyTolerancePx = $state(2);
	let outlineSimplifySummary = $state('');
	let activeSymbols = $derived(
		topoSymbols.filter(
			(symbol) => symbol.type === (activeTool === 'fixpoint' ? 'fixpoint' : 'feature')
		)
	);

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

	function simplifySelectedOutline() {
		const result = editor2D?.simplifySelectedOutline(outlineSimplifyTolerancePx);
		if (!result) return;
		outlineSimplifySummary = result.changed
			? `${result.previousPointCount} → ${result.pointCount} vertices at ${result.tolerance}px.`
			: `No further simplification at ${result.tolerance}px.`;
	}
</script>

<Topo2DEditor
	bind:this={editor2D}
	bind:activeTool
	bind:drawingTarget
	selectedSymbol={userState.ui.selectedSymbol}
	{selectedOutlineStyle}
	bind:snapRoutesToFixpoints
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

{#if activeTool === 'outline'}
	<OutlineToolOptions
		outlineTool={editor2D?.getCurrentTool?.()}
		{activeTool}
		bind:selectedOutlineStyle
		onClose={() => (activeTool = 'select')}
	/>
{:else if ['route', 'multipitch'].includes(activeTool)}
	<ToolOptions title={$_('ui.route')} onClose={() => (activeTool = 'select')}>
		<label class="flex cursor-pointer items-center justify-between gap-3 text-sm text-near-black">
			<span>{$_('ui.snap_routes_to_fixpoints')}</span>
			<input type="checkbox" bind:checked={snapRoutesToFixpoints} />
		</label>
		<p class="text-[10px] text-warm-gray-500">{$_('ui.snap_routes_to_fixpoints_hint')}</p>
	</ToolOptions>
{:else if ['symbol', 'fixpoint'].includes(activeTool)}
	<ToolOptions title={$_(`ui.${activeTool}`)} onClose={() => (activeTool = 'select')}>
		<div class="grid grid-cols-5 gap-1.5">
			{#each activeSymbols as symbol}
				<button
					type="button"
					class={`flex min-h-11 flex-col items-center justify-center rounded-sm p-1.5 transition-none ${userState.ui.selectedSymbol === symbol.id ? 'bg-creator-blue text-white ring-1 ring-creator-blue' : 'bg-black/5 hover:bg-black/10'}`}
					onclick={() => (userState.ui.selectedSymbol = symbol.id)}
					title={$_(`topo.fixpoints.${symbol.id}`)}
					aria-label={$_(`topo.fixpoints.${symbol.id}`)}
				>
					<img src={symbol.icon} alt="" class="h-5 w-5" />
				</button>
			{/each}
		</div>
	</ToolOptions>
{:else if activeTool === 'outlineEdit' && userState.ui.selectedOutlineId}
	<ToolOptions title="Outline tools" onClose={() => (activeTool = 'select')}>
		<div class="flex flex-col gap-2">
			<label class="text-xs font-medium text-warm-gray-600" for="outline-simplify-tolerance">
				Simplify selected outline
			</label>
			<div class="grid grid-cols-[1fr_auto] gap-1 items-center">
				<input
					id="outline-simplify-tolerance"
					bind:value={outlineSimplifyTolerancePx}
					type="number"
					min="0.5"
					step="0.5"
					class="input-studio w-full"
					aria-label="Simplification tolerance in pixels"
				/>
				<button
					type="button"
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={simplifySelectedOutline}>Simplify</button
				>
			</div>
			<p class="text-[10px] text-warm-gray-400">
				Removes redundant vertices using a pixel tolerance. Undo restores the original.
			</p>
			{#if outlineSimplifySummary}
				<p class="text-[10px] text-warm-gray-500">{outlineSimplifySummary}</p>
			{/if}
		</div>
	</ToolOptions>
{/if}

<TopoPropertiesPanel bind:showMapModal bind:drawingTarget bind:activeTool />
