<script>
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	let {
		inspectorShadow = true,
		activeTab = $bindable('info'),
		detectedAssets = [],
		editingTrackIndex = null,
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		commonEquipment = [],
		selectedSectorId = $bindable(null),
		saveStatus = 'idle',
		onAddEquipmentItem = () => {},
		onRemoveEquipmentItem = () => {},
		onAddCragImages = () => {},
		onRemoveCragImage = () => {},
		onAddSector = () => {},
		onDuplicateSector = () => {},
		onRemoveSector = () => {},
		onMoveSector = () => {},
		onFocusSector = () => {},
		onSetSectorGeometryType = () => {},
		onSetHoverHighlight = () => {},
		onClearDetectedAssets = () => {},
		onAddDetectedAsset = () => {},
		onRemoveTransit = () => {},
		onRemoveParking = () => {},
		onEditTrack = () => {},
		onRemoveTrack = () => {},
		onFinalizeTrack = () => {},
		onCancelTrackEdit = () => {}
	} = $props();
</script>

<div class="fixed top-14 right-2 z-50 flex flex-col w-80 max-h-[calc(100vh-4rem)]">
	<div class="panel flex-1 flex flex-col overflow-hidden {inspectorShadow ? 'shadow-panel' : ''}">
		<div class="flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 flex-shrink-0">
			<div>
				<h1 class="text-section-title">Properties</h1>
				<p class="text-ui-label !m-0">Crag Inspector</p>
			</div>
		</div>

		<CragEditorPanelContent
			bind:activeTab
			bind:selectedSectorId
			{detectedAssets}
			{editingTrackIndex}
			{cragTypes}
			{availableTags}
			{securityOptions}
			{rockTypes}
			{commonEquipment}
			{saveStatus}
			{onAddEquipmentItem}
			{onRemoveEquipmentItem}
			{onAddCragImages}
			{onRemoveCragImage}
			{onAddSector}
			{onDuplicateSector}
			{onRemoveSector}
			{onMoveSector}
			{onFocusSector}
			{onSetSectorGeometryType}
			{onSetHoverHighlight}
			{onClearDetectedAssets}
			{onAddDetectedAsset}
			{onRemoveTransit}
			{onRemoveParking}
			{onEditTrack}
			{onRemoveTrack}
			{onFinalizeTrack}
			{onCancelTrackEdit}
		/>
	</div>

	<div class="mt-2 panel p-2 bg-white flex justify-between items-center shadow-sm border-black/15">
		<span class="text-ui-label text-warm-gray-500 !m-0">GPS</span>
		<div class="font-mono text-micro-data text-creator-blue font-bold">
			{cragEditorState.crag.geometry.coordinates[1].toFixed(5)}
			, {cragEditorState.crag.geometry.coordinates[0].toFixed(5)}
		</div>
	</div>
</div>
