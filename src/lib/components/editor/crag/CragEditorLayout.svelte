<script>
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import CragEditorToolbar from '$lib/components/editor/crag/CragEditorToolbar.svelte';
	import CragEditorSidebar from '$lib/components/editor/crag/CragEditorSidebar.svelte';

	let {
		inspectorShadow = true,
		map,
		isExpanded = false,
		isCompact = false,
		isMedium = false,
		isLandscape = false,
		CragEditorBottomSheet,
		activeTool = $bindable('position'),
		mapStyle = $bindable('transport'),
		activeTab = $bindable('info'),
		detectedAssets = [],
		selectedSectorId = $bindable(null),
		routeDocuments = [],
		selectedRouteKey = null,
		currentTrackPoints = [],
		editingTrackIndex = null,
		trackDraftMode = 'routing',
		isRoutingTrack = false,
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
		onHandleTrackConfirm = () => {},
		onCancelTrackEdit = () => {},
		onUndoTrackPoint = () => {},
		onGpxUpload = () => {},
		onExport = () => {},
		onUseSearchPosition = () => {},
		onLocateUser = () => {},
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
		onRemoveTransit = () => {},
		onRemoveParking = () => {},
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
		onDeleteRoute = () => {}
	} = $props();
</script>

<CragEditorToolbar
	bind:activeTool
	bind:mapStyle
	{currentTrackPoints}
	{trackDraftMode}
	{isRoutingTrack}
	{onBack}
	{onStartRoutingDraft}
	{onHandleTrackConfirm}
	{onCancelTrackEdit}
	{onUndoTrackPoint}
	{onGpxUpload}
	{onLocateUser}
	{onExport}
	status={saveStatus}
	errorMessage={saveError}
/>

{#if isExpanded}
	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
		<MapSearch {map} onUsePosition={onUseSearchPosition} />
	</div>
{/if}

<CragEditorSidebar
		{inspectorShadow}
		bind:activeTab
		{detectedAssets}
		{editingTrackIndex}
		{routeDocuments}
		{selectedRouteKey}
		{cragTypes}
		{availableTags}
		{securityOptions}
		{rockTypes}
		{commonEquipment}
		bind:selectedSectorId
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
		{onRemoveTransit}
		{onRemoveParking}
		{onEditTrack}
		{onRemoveTrack}
		{onFinalizeTrack}
		{onCancelTrackEdit}
		{onAddParentRoute}
		{onAddSectorRoute}
		{onSelectRoute}
		{onUpdateRouteName}
		{onUpdateRoute}
		{onDeleteRoute}
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
