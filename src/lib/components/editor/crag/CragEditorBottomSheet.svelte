<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	// Props from CragEditorSidebar
	let {
		activeTab = $bindable('info'),
		detectedAssets = [],
		activeTrackTarget = null,
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		commonEquipment = [],
		selectedObject = $bindable(null),
		routeDocuments = [],
		onEditRoutePath = () => {},
		onDeleteRoutePath = () => {},
		saveStatus = 'idle',
		onAddEquipmentItem = () => {},
		onRemoveEquipmentItem = () => {},
		onAddCragImages = () => {},
		onRemoveCragImage = () => {},
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
		onCancelTrackEdit = () => {},
		onAddParentRoute = () => {},
		onAddSectorRoute = () => {},
		onSelectRoute = () => {},
		onUpdateRouteName = () => {},
		onUpdateRoute = () => {},
		onAddRoutePath = () => {},
		onUpdateRoutePath = () => {},
		onRemoveRoutePath = () => {},
		onDeleteRoute = () => {}
	} = $props();

</script>

<script module>
	import { resize } from '$lib/assets/js/resize.js';
</script>

{#if browser}
	<div class="fixed inset-0 z-40 pointer-events-none">
		<div
			use:resize
			class="fixed left-0 right-0 z-50 flex flex-col bg-white shadow-panel rounded-t-lg overflow-hidden pointer-events-auto"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Drag handle -->
			<div class="w-full py-2 flex justify-center shrink-0">
				<div class="w-12 h-1.5 bg-warm-gray-300 rounded-full"></div>
			</div>
			
			<CragEditorPanelContent
				bind:activeTab
				bind:selectedObject
				{routeDocuments}
				{onEditRoutePath}
				{onDeleteRoutePath}
				{detectedAssets}
				{activeTrackTarget}
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
				{onUpdateRoutePath}
				{onRemoveRoutePath}
				{onDeleteRoute}
			/>
		</div>
	</div>
{:else}
	<!-- SSR fallback -->
	<div class="fixed left-0 right-0 bottom-0 z-50 bg-white shadow-panel rounded-t-lg overflow-hidden">
		<div class="w-full py-2 flex justify-center touch-none">
			<div class="w-12 h-1.5 bg-warm-gray-300 rounded-full"></div>
		</div>
		<div class="p-4 text-center text-ui-label">
			Loading editor...
		</div>
	</div>
{/if}

<style>
	:global(.shadow-panel) {
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
	}
</style>
