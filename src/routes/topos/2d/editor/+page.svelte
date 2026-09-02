<script>
	import ToolPalette2D from '$lib/components/editor/2d/ToolPalette2D.svelte';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.js';
	import { useTopoDraftAutosave } from '$lib/components/editor/use-topo-draft-autosave.svelte.js';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import Topo2DEditor from '$lib/components/editor/2d/Topo2DEditor.svelte';
	import OutlineToolOptions from '$lib/components/editor/tools/OutlineToolOptions.svelte';
	import SelectToolOptions from '$lib/components/editor/tools/SelectToolOptions.svelte';
	import PathDrawingOptions from '$lib/components/editor/tools/PathDrawingOptions.svelte';
	import {
		createOutlineGridOptionsLogic,
		createSelectedOutlineCurveLogic,
		createSelectedOutlineStyleLogic
	} from '$lib/components/editor/tools/outline-tool-options-logic.js';
	import { createPathDrawingOptionsLogic } from '$lib/components/editor/tools/path-drawing-logic.js';
	import TextToolOptions from '$lib/components/editor/tools/TextToolOptions.svelte';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import TopoPropertiesPanel from '$lib/components/editor/TopoPropertiesPanel.svelte';
	import { authState } from '$lib/api/auth.svelte.js';
	import { writeJson } from '$lib/api/felslager.js';
	import { topoSymbols } from '@vorstieg/topo-renderer';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { loadTopoEditorEntry } from '$lib/assets/js/open-topo-editor-entry.js';

	let { entryPath = null } = $props();
	const initialEntryPath = untrack(() => entryPath);
	const initialSectorId = untrack(() => page.url.searchParams.get('sector'));
	const editorState = provideTopo2DEditorState(createTopo2DEditorState());
	let toolOptionsOpen = $state(false);
	let showMapModal = $state(false);
	let editor2D = $state();
	let saveStatus = $state();
	let saveError = $state();
	let outlineSimplifyTolerancePx = $state(2);
	let outlineSimplifySummary = $state('');
	let outlineEditTool = $derived(editor2D?.getOutlineEditTool?.() || null);
	let lastOpenedOutlineEditId = $state(null);
	let isEditingSelectedPath = $derived.by(() => {
		if (editorState.ui.activeTool !== 'select') return false;

		const { selectedOutlineId, selectedRouteId, selectedPitchId, selectedVariantId } =
			editorState.ui;
		if (selectedOutlineId != null)
			return selectedRouteId == null && editorState.selectedItems.size === 1;
		if (selectedRouteId == null) return false;

		const hasNestedPath = (selectedPitchId != null) !== (selectedVariantId != null);
		return (
			editorState.selectedItems.size === (hasNestedPath ? 2 : 1) &&
			editorState.selectedItems.has(`route:${selectedRouteId}`)
		);
	});
	const outlineEditGridActions = createOutlineGridOptionsLogic(() => outlineEditTool, {
		maxGridSize: 0.25
	});
	let selectedOutline = $derived(
		editorState.topo.outlines.find(
			(outline) => String(outline.id) === String(editorState.ui.selectedOutlineId)
		) || null
	);
	let selectedRoute = $derived(
		editorState.topo.routes.find(
			(route) => String(route.id) === String(editorState.ui.selectedRouteId)
		) || null
	);
	let routeEditTool = $derived(editor2D?.getRouteEditTool?.() || null);
	const outlineCurveActions = createSelectedOutlineCurveLogic(
		() => outlineEditTool,
		() => editorState.ui.selectedOutlineId
	);
	const outlineStyleActions = createSelectedOutlineStyleLogic(
		() => outlineEditTool,
		() => editorState.ui.selectedOutlineId
	);
	const routeDrawingActions = createPathDrawingOptionsLogic({
		getGridTool: () => editor2D?.getCurrentTool?.(),
		getCurveTarget: () => editor2D?.getCurrentTool?.(),
		updateCurve: (tool, changes) => {
			if ('enabled' in changes) tool.curveEnabled = changes.enabled;
			if ('tension' in changes) tool.curveTension = changes.tension;
		}
	});

	$effect(() => {
		const selectionId = editorState.ui.selectedOutlineId || editorState.ui.selectedRouteId;
		if (!isEditingSelectedPath) {
			lastOpenedOutlineEditId = null;
			return;
		}
		if (selectionId === lastOpenedOutlineEditId) return;
		toolOptionsOpen = true;
		lastOpenedOutlineEditId = selectionId;
	});
	let activeSymbols = $derived(
		topoSymbols.filter(
			(symbol) =>
				symbol.type === (editorState.ui.activeTool === 'fixpoint' ? 'fixpoint' : 'feature')
		)
	);

	useTopoDraftAutosave({
		session: editorState,
		draftId: browser ? new URL(window.location.href).searchParams.get('draft') : null,
		entryPath: initialEntryPath,
		loadEntrySession: async () => {
			await loadTopoEditorEntry({
				entryPath: initialEntryPath,
				sectorId: initialSectorId,
				workspace: '/topos/2d/editor',
				topoSession: editorState
			});
			initializeIdCounters(editorState.topo);
		},
		editorMode: '2d',
		getWorkspace: () => '/topos/2d/editor',
		getSaveSession: () => ({
			...editorState.getSaveSession(),
			topo: editorState.getSaveSnapshot()
		}),
		onPersisted: () => editorState.markSaved(),
		restoreSession: (session, id) => {
			editorState.loadSession(session, id);
			initializeIdCounters(editorState.topo);
		},
		getSaveSignature: () =>
			JSON.stringify({
				document: editorState.getSaveSnapshot(),
				historyIndex: editorState.history.index,
				historyLength: editorState.history.entries.length
			}),
		onInitialized: () => initializeIdCounters(editorState.topo),
		shouldRestore: () => !initialEntryPath
	});

	async function saveTopo() {
		// Require authentication
		if (!authState.requireAuth(() => saveTopo())) return;

		try {
			editorState.mutateDocument((topo) => {
				topo.date = topo.date || new Date().toISOString().split('T')[0];
				topo.updated = new Date().toISOString().split('T')[0];
			});

			let topoToSave = editorState.getSaveSnapshot();

			// Remove internal UI fields before saving
			delete topoToSave._entryPath;
			delete topoToSave._topoFileName;
			delete topoToSave.name;

			await writeJson(editorState.topo._topoFileName, topoToSave);
			editorState.markSaved();

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

<Topo2DEditor {editorState} bind:this={editor2D} />

<ToolPalette2D
	bind:activeTool={editorState.ui.activeTool}
	bind:toolOptionsOpen
	bind:selectedSymbol={editorState.ui.selectedSymbol}
	bind:selectedOutlineStyle={editorState.ui.selectedOutlineStyle}
	hasPendingChanges={editorState.hasPendingChanges}
	onFinishRoute={() => editor2D.finalize()}
	onCancelAction={() => editor2D.cancel()}
	onUndo={() => editor2D?.undo()}
	onRedo={() => editor2D?.redo()}
	onExport={saveTopo}
	status={saveStatus}
	errorMessage={saveError}
/>
{#if toolOptionsOpen}
	{#if editorState.ui.activeTool === 'outline'}
		<OutlineToolOptions
			outlineTool={editor2D?.getCurrentTool?.()}
			activeTool={editorState.ui.activeTool}
			bind:selectedOutlineStyle={editorState.ui.selectedOutlineStyle}
			onClose={() => (toolOptionsOpen = false)}
		/>
	{:else if editorState.ui.activeTool === 'text'}
		<TextToolOptions
			textTool={editor2D?.getCurrentTool?.()}
			open={toolOptionsOpen}
			onClose={() => (toolOptionsOpen = false)}
		/>
	{:else if ['route', 'multipitch'].includes(editorState.ui.activeTool)}
		<ToolOptions
			title={$_(`ui.${editorState.ui.activeTool === 'multipitch' ? 'multipitch' : 'route'}`)}
			open={toolOptionsOpen}
			onClose={() => (toolOptionsOpen = false)}
		>
			{@const routeTool = editor2D?.getCurrentTool?.()}
			<PathDrawingOptions
				snapToGrid={routeTool?.snapToGrid}
				gridSize={routeTool?.gridSize}
				curveEnabled={routeTool?.curveEnabled}
				curveTension={routeTool?.curveTension}
				onToggleSnapToGrid={routeDrawingActions.toggleSnapToGrid}
				onGridSizeChange={routeDrawingActions.setGridSize}
				onCurveEnabledChange={routeDrawingActions.setCurveEnabled}
				onCurveTensionChange={routeDrawingActions.setCurveTension}
			/>
			<label class="flex cursor-pointer items-center justify-between gap-3 text-sm text-near-black">
				<span>{$_('ui.snap_routes_to_anchors')}</span>
				<input type="checkbox" bind:checked={editorState.ui.snapRoutesToAnchors} />
			</label>
			<p class="text-[10px] text-warm-gray-500">{$_('ui.snap_routes_to_anchors_hint')}</p>
		</ToolOptions>
	{:else if ['symbol', 'fixpoint'].includes(editorState.ui.activeTool)}
		<ToolOptions
			title={$_(`ui.${editorState.ui.activeTool}`)}
			open={toolOptionsOpen}
			onClose={() => (toolOptionsOpen = false)}
		>
			<div class="grid grid-cols-5 gap-1.5">
				{#each activeSymbols as symbol}
					<button
						type="button"
						class={`flex min-h-11 flex-col items-center justify-center rounded-sm p-1.5 transition-none ${editorState.ui.selectedSymbol === symbol.id ? 'bg-creator-blue text-white ring-1 ring-creator-blue' : 'bg-black/5 hover:bg-black/10'}`}
						onclick={() => (editorState.ui.selectedSymbol = symbol.id)}
						title={$_(`topo.fixpoints.${symbol.id}`)}
						aria-label={$_(`topo.fixpoints.${symbol.id}`)}
					>
						<img src={symbol.icon} alt="" class="h-5 w-5" />
					</button>
				{/each}
			</div>
		</ToolOptions>
	{:else if editorState.ui.activeTool === 'select'}
		<SelectToolOptions
			selectedOutlineId={isEditingSelectedPath ? editorState.ui.selectedOutlineId : null}
			selectedRoute={isEditingSelectedPath &&
				selectedRoute && {
					...selectedRoute,
					routeEditTool,
					onCurveChange: (changes) =>
						editorState.updateRoute(selectedRoute.id, {
							curve: { enabled: false, tension: 0.45, ...(selectedRoute.curve || {}), ...changes }
						})
				}}
			{selectedOutline}
			{outlineEditTool}
			outlineGridActions={outlineEditGridActions}
			{outlineCurveActions}
			{outlineStyleActions}
			bind:simplifyTolerancePx={outlineSimplifyTolerancePx}
			simplifySummary={outlineSimplifySummary}
			onSimplify={simplifySelectedOutline}
			onClose={() => (toolOptionsOpen = false)}
		/>
	{/if}
{/if}

<TopoPropertiesPanel
	bind:showMapModal
	bind:drawingTarget={editorState.ui.drawingTarget}
	bind:activeTool={editorState.ui.activeTool}
	bind:toolOptionsOpen
/>
