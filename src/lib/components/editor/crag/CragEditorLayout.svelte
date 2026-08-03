<script>
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import MapStyleControl from '$lib/components/editor/MapStyleControl.svelte';
	import CragEditorToolbar from '$lib/components/editor/crag/CragEditorToolbar.svelte';
	import CragEditorSidebar from '$lib/components/editor/crag/CragEditorSidebar.svelte';
	import ToolOptions from '$lib/components/editor/tools/ToolOptions.svelte';
	import { _ } from 'svelte-i18n';

	let {
		inspectorShadow = true,
		map,
		isExpanded = false,
		isCompact = false,
		isMedium = false,
		isLandscape = false,
		CragEditorBottomSheet,
		activeTool = $bindable('select'),
		toolOptionsOpen = $bindable(false),
		mapStyle = $bindable('transport'),
		activeTab = $bindable('info'),
		detectedAssets = [],
		selectedObject = $bindable(null),
		routeDocuments = [],
		currentTrackPoints = [],
		editingTrackIndex = null,
		trackDraftMode = 'routing',
		isRoutingTrack = false,
		hasPendingTrackCut = false,
		isRoutePathDrawing = false,
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		commonEquipment = [],
		onAddCragImages = () => {},
		onRemoveCragImage = () => {},
		saveStatus = 'idle',
		saveError = '',
		onBack = () => {},
		onStartRoutingDraft = () => {},
		onSetTrackDraftMode = () => {},
		onHandleTrackConfirm = () => {},
		onCancelTrackEdit = () => {},
		onUndoTrackPoint = () => {},
		onStartTrackCut = () => {},
		onConfirmTrackCut = () => {},
		onCancelTrackCut = () => {},
		onReverseTrack = () => {},
		onTrimTrackStart = () => {},
		onTrimTrackEnd = () => {},
		onSimplifyTrack = () => {},
		onGpxUpload = () => {},
		onExport = () => {},
		onCenterMapOnUser = () => {},
		onAddEquipmentItem = () => {},
		onRemoveEquipmentItem = () => {},
		onAddSector = () => {},
		onDuplicateSector = () => {},
		onRemoveSector = () => {},
		onMoveSector = () => {},
		onSetSectorGeometryType = () => {},
		onFocusSector = () => {},
		onSetHoverHighlight = () => {},
		onClearDetectedAssets = () => {},
		onAddDetectedAsset = () => {},
		onRemoveAccessFeature = () => {},
		onEditTrack = () => {},
		onRemoveTrack = () => {},
		onFinalizeTrack = () => {},
		vertexDeleteUndo = null,
		onUndoSectorVertexDelete = () => {},
		onAddParentRoute = () => {},
		onAddSectorRoute = () => {},
		onSelectRoute = () => {},
		onUpdateRouteName = () => {},
		onUpdateRoute = () => {},
		onAddRoutePath = () => {},
		onEditRoutePath = () => {},
		onUpdateRoutePath = () => {},
		onRemoveRoutePath = () => {},
		onDeleteRoute = () => {},
		onPlanGenerated = () => {}
	} = $props();

	let trimPointIndex = $state(0);
	let simplifyToleranceMeters = $state(10);
	let simplifySummary = $state('');
	let canEditTrack = $derived(currentTrackPoints.length > 1);

	function trimStart() {
		if (onTrimTrackStart(trimPointIndex)) trimPointIndex = 0;
	}

	function trimEnd() {
		if (onTrimTrackEnd(trimPointIndex)) trimPointIndex = Math.max(0, currentTrackPoints.length - 1);
	}

	function simplify() {
		const result = onSimplifyTrack(simplifyToleranceMeters);
		if (!result) return;
		simplifySummary = result.changed
			? `${result.previousPointCount} → ${result.pointCount} points at ${result.tolerance} m tolerance.`
			: `No further simplification at ${result.tolerance} m. Increase tolerance.`;
	}

</script>

<CragEditorToolbar
	{map}
	bind:activeTool
	bind:toolOptionsOpen
		{currentTrackPoints}
		{trackDraftMode}
		{isRoutingTrack}
		{hasPendingTrackCut}
	{isRoutePathDrawing}
	{onBack}
	{onStartRoutingDraft}
	{onHandleTrackConfirm}
	{onCancelTrackEdit}
		{onUndoTrackPoint}
		{onConfirmTrackCut}
		{onCancelTrackCut}
	{onExport}
	status={saveStatus}
	errorMessage={saveError}
/>

<MapStyleControl bind:mapStyle {isExpanded} {toolOptionsOpen} />

<button
	type="button"
	class="fixed z-40 flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-warm-gray-600 shadow-panel transition-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-creator-blue"
	style:right={isExpanded ? 'calc(20rem + 1.25rem)' : '1.25rem'}
	style:bottom={isExpanded
		? '1.25rem'
		: toolOptionsOpen
			? 'calc(var(--mobile-tool-dock-height, 7.5rem) + var(--mobile-tool-options-height, 0px) + max(0.75rem, env(safe-area-inset-bottom)))'
			: 'calc(var(--info-panel-height, 0px) + var(--mobile-tool-dock-height, 7.5rem) + max(0.75rem, env(safe-area-inset-bottom)))'}
	onclick={onCenterMapOnUser}
	title="Center map on current location"
	aria-label="Center map on current location"
>
	<i class="fa-solid fa-location-crosshairs text-sm"></i>
</button>

{#if toolOptionsOpen && activeTool === 'track'}
	<ToolOptions title={$_('ui.track_tool_options')} open={toolOptionsOpen} onClose={() => (toolOptionsOpen = false)}>
		<div class="flex flex-col gap-2">
			<div class="text-xs font-medium text-warm-gray-600">{$_('ui.drawing_mode')}</div>
			<div class="grid grid-cols-2 gap-1">
				<button
					type="button"
					class={`flex flex-col items-center gap-1 rounded-sm p-2 transition-none ${trackDraftMode === 'routing'
						? 'bg-creator-blue text-white'
						: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}`}
					onclick={() => onSetTrackDraftMode('routing')}
				>
					<i class="fa-solid fa-route text-sm"></i>
					<span class="text-[9px] font-medium">{$_('ui.routing_mode')}</span>
				</button>
				<button
					type="button"
					class={`flex flex-col items-center gap-1 rounded-sm p-2 transition-none ${trackDraftMode === 'editing'
						? 'bg-creator-blue text-white'
						: 'bg-black/5 text-warm-gray-500 hover:bg-black/10'}`}
					onclick={() => onSetTrackDraftMode('editing')}
				>
					<i class="fa-solid fa-pen-to-square text-sm"></i>
					<span class="text-[9px] font-medium">{$_('ui.editing_mode')}</span>
				</button>
			</div>
		</div>
		<label
			class="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-black/15 bg-warm-white px-3 text-[10px] font-bold uppercase tracking-widest text-creator-blue transition-none hover:bg-black/5"
		>
			<i class="fa-solid fa-file-import text-xs"></i>
			{$_('ui.import_gpx')}
			<input type="file" accept=".gpx" class="hidden" onchange={onGpxUpload} />
		</label>
		<button
			type="button"
			class="flex h-10 items-center justify-center gap-1.5 rounded-sm border border-black/15 bg-warm-white px-3 text-[10px] font-bold uppercase tracking-widest text-creator-blue transition-none hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
			onclick={onStartTrackCut}
			disabled={(editingTrackIndex === null && (!isRoutePathDrawing || trackDraftMode !== 'editing')) || !canEditTrack}
		>
			<i class="fa-solid fa-scissors text-xs"></i>
			Cut track
		</button>
		<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-ui-label font-bold uppercase tracking-wide text-warm-gray-500">Track tools</div>
					<div class="text-[10px] text-warm-gray-400">Enter a track point index to trim it.</div>
				</div>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={onReverseTrack}
					disabled={!canEditTrack}>Reverse</button
				>
			</div>
			<div class="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
				<input
					bind:value={trimPointIndex}
					type="number"
					min="0"
					max={Math.max(0, currentTrackPoints.length - 1)}
					class="input-studio w-full"
					placeholder="Point index"
					disabled={!canEditTrack}
				/>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={trimStart}
					disabled={!canEditTrack}>Trim start</button
				>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={trimEnd}
					disabled={!canEditTrack}>Trim end</button
				>
			</div>
			<div class="grid grid-cols-[1fr_auto] gap-1 items-center">
				<input
					bind:value={simplifyToleranceMeters}
					type="number"
					min="1"
					step="1"
					class="input-studio w-full"
					placeholder="Tolerance (m)"
					disabled={!canEditTrack}
				/>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={simplify}
					disabled={!canEditTrack}>Simplify path</button
				>
			</div>
			<div class="text-[10px] text-warm-gray-400">Removes redundant points using the tolerance in meters.</div>
			{#if simplifySummary}
				<div class="text-[10px] text-warm-gray-500">{simplifySummary}</div>
			{/if}
		</div>
	</ToolOptions>
{/if}

{#if isExpanded}
	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))]">
		<MapSearch {map} />
	</div>
{/if}

<CragEditorSidebar
		{inspectorShadow}
		{map}
		bind:activeTab
		{detectedAssets}
		{editingTrackIndex}
		{routeDocuments}
		{cragTypes}
		{availableTags}
		{securityOptions}
		{rockTypes}
		{commonEquipment}
		bind:selectedObject
		{saveStatus}
		{onAddEquipmentItem}
		{onRemoveEquipmentItem}
		{onAddCragImages}
		{onRemoveCragImage}
		{onAddSector}
		{onDuplicateSector}
		{onRemoveSector}
		{onMoveSector}
		{onSetSectorGeometryType}
		{onFocusSector}
		{onSetHoverHighlight}
		{onClearDetectedAssets}
		{onAddDetectedAsset}
		{onRemoveAccessFeature}
		{onEditTrack}
		{onRemoveTrack}
		{onFinalizeTrack}
		{onCancelTrackEdit}
		{onAddParentRoute}
		{onAddSectorRoute}
		{onSelectRoute}
		{onUpdateRouteName}
		{onUpdateRoute}
		{onAddRoutePath}
		{onEditRoutePath}
		{onUpdateRoutePath}
		{onRemoveRoutePath}
		{onDeleteRoute}
		{onPlanGenerated}
	/>

{#if vertexDeleteUndo}
	<div
		class="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		<span>Vertex deleted</span>
		<button
			type="button"
			class="rounded-sm bg-white/10 px-2 py-1 text-ui-label font-bold uppercase text-white hover:bg-white/20"
			onclick={onUndoSectorVertexDelete}
		>
			Undo
		</button>
	</div>
{/if}
