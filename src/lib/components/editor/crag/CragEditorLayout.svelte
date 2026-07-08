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
		CompactAppBar,
		MobileToolPill,
		CragEditorBottomSheet,
		activeTool = $bindable('position'),
		mapStyle = $bindable('transport'),
		activeTab = $bindable('info'),
		detectedAssets = [],
		selectedSectorId = $bindable(null),
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
		onUndoSectorVertexDelete = () => {}
	} = $props();
</script>

{#if isExpanded}
	<CragEditorToolbar
		bind:activeTool
		bind:mapStyle
		{currentTrackPoints}
		{editingTrackIndex}
		{trackDraftMode}
		{isRoutingTrack}
		onBack={onBack}
		onStartRoutingDraft={onStartRoutingDraft}
		onHandleTrackConfirm={onHandleTrackConfirm}
		onCancelTrackEdit={onCancelTrackEdit}
		onGpxUpload={onGpxUpload}
		onExport={onExport}
		status={saveStatus}
		errorMessage={saveError}
	/>
{/if}

{#if isCompact || isMedium}
	{#if CompactAppBar}
		<CompactAppBar
			bind:activeTool
			bind:mapStyle
			{currentTrackPoints}
			{editingTrackIndex}
			{trackDraftMode}
			{isRoutingTrack}
			onBack={onBack}
			onStartRoutingDraft={onStartRoutingDraft}
			onHandleTrackConfirm={onHandleTrackConfirm}
			onCancelTrackEdit={onCancelTrackEdit}
			onGpxUpload={onGpxUpload}
			onExport={onExport}
			onLocateUser={onLocateUser}
			status={saveStatus}
			errorMessage={saveError}
		/>
	{/if}
{/if}

{#if isExpanded}
	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
		<MapSearch {map} onUsePosition={onUseSearchPosition} />
	</div>
{/if}

{#if isCompact || isMedium}
	{#if MobileToolPill}
		<MobileToolPill bind:activeTool />
	{/if}
{/if}

{#if isExpanded}
	<CragEditorSidebar
		{inspectorShadow}
		bind:activeTab
		{detectedAssets}
		{editingTrackIndex}
		{cragTypes}
		{availableTags}
		{securityOptions}
		{rockTypes}
		{commonEquipment}
		bind:selectedSectorId
		saveStatus={saveStatus}
		onAddEquipmentItem={onAddEquipmentItem}
		onRemoveEquipmentItem={onRemoveEquipmentItem}
		onAddCragImages={onAddCragImages}
		onRemoveCragImage={onRemoveCragImage}
		onAddSector={onAddSector}
		onDuplicateSector={onDuplicateSector}
		onRemoveSector={onRemoveSector}
		onMoveSector={onMoveSector}
		onSetSectorGeometryType={onSetSectorGeometryType}
		onFocusSector={onFocusSector}
		onSetHoverHighlight={onSetHoverHighlight}
		onClearDetectedAssets={onClearDetectedAssets}
		onAddDetectedAsset={onAddDetectedAsset}
		onRemoveTransit={onRemoveTransit}
		onRemoveParking={onRemoveParking}
		onEditTrack={onEditTrack}
		onRemoveTrack={onRemoveTrack}
		onFinalizeTrack={onFinalizeTrack}
		onCancelTrackEdit={onCancelTrackEdit}
	/>
{/if}

{#if isCompact || isMedium}
	{#if CragEditorBottomSheet}
		<CragEditorBottomSheet
			bind:activeTab
			{detectedAssets}
			{editingTrackIndex}
			{cragTypes}
			{availableTags}
			{securityOptions}
			{rockTypes}
			{commonEquipment}
			bind:selectedSectorId
			saveStatus={saveStatus}
			onAddEquipmentItem={onAddEquipmentItem}
			onRemoveEquipmentItem={onRemoveEquipmentItem}
			onAddCragImages={onAddCragImages}
			onRemoveCragImage={onRemoveCragImage}
			onAddSector={onAddSector}
			onDuplicateSector={onDuplicateSector}
			onRemoveSector={onRemoveSector}
			onMoveSector={onMoveSector}
			onSetSectorGeometryType={onSetSectorGeometryType}
			onFocusSector={onFocusSector}
			onSetHoverHighlight={onSetHoverHighlight}
			onClearDetectedAssets={onClearDetectedAssets}
			onAddDetectedAsset={onAddDetectedAsset}
			onRemoveTransit={onRemoveTransit}
			onRemoveParking={onRemoveParking}
			onEditTrack={onEditTrack}
			onRemoveTrack={onRemoveTrack}
			onFinalizeTrack={onFinalizeTrack}
			onCancelTrackEdit={onCancelTrackEdit}
		/>
	{/if}
{/if}

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
