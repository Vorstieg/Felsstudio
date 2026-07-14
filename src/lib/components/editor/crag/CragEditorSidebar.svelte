<script>
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import DetailsComponent from '../DetailsComponent.svelte';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	let {
		inspectorShadow = true, activeTab = $bindable('info'), detectedAssets = [], editingTrackIndex = null,
		cragTypes = [], availableTags = [], securityOptions = [], rockTypes = [], commonEquipment = [],
		selectedSectorId = $bindable(null), saveStatus = 'idle', onAddEquipmentItem = () => {
		},
		onRemoveEquipmentItem = () => {
		}, onAddCragImages = () => {
		}, onRemoveCragImage = () => {
		},
		onAddSector = () => {
		}, onDuplicateSector = () => {
		}, onRemoveSector = () => {
		}, onMoveSector = () => {
		},
		onFocusSector = () => {
		}, onSetSectorGeometryType = () => {
		}, onSetHoverHighlight = () => {
		},
		onClearDetectedAssets = () => {
		}, onAddDetectedAsset = () => {
		}, onRemoveTransit = () => {
		},
		onRemoveParking = () => {
		}, onEditTrack = () => {
		}, onRemoveTrack = () => {
		},
		onFinalizeTrack = () => {
		}, onCancelTrackEdit = () => {
		}, routeDocuments = [], selectedRouteKey = null, onAddParentRoute = () => {
		}, onAddSectorRoute = () => {
		}, onSelectRoute = () => {
		}, onUpdateRouteName = () => {
		}, onUpdateRoute = () => {
		}, onDeleteRoute = () => {
		}
	} = $props();

	let tabs = $derived([
		{ id: 'info', label: 'Metadata', icon: 'fa-circle-info' },
		{
			id: 'registry',
			label: 'Registry',
			icon: 'fa-layer-group',
			count: cragEditorState.transit.length + cragEditorState.parking.length + cragEditorState.tracks.length
		},
		{ id: 'sectors', label: 'Sectors', icon: 'fa-table-cells-large', count: cragEditorState.crag.sectors?.length || 0 }
	]);
</script>

<DetailsComponent title="Properties" subtitle="Crag Inspector" {tabs} bind:activeTab shadow={inspectorShadow}
                  width="20rem">
	{#snippet children()}
		<CragEditorPanelContent
			bind:activeTab bind:selectedSectorId showTabs={false} {detectedAssets} {editingTrackIndex} {cragTypes}
			{routeDocuments} {selectedRouteKey} {onAddParentRoute} {onAddSectorRoute} {onSelectRoute} {onUpdateRouteName} {onUpdateRoute} {onDeleteRoute}
			{availableTags}
			{securityOptions} {rockTypes} {commonEquipment} {saveStatus} {onAddEquipmentItem}
			{onRemoveEquipmentItem} {onAddCragImages} {onRemoveCragImage} {onAddSector} {onDuplicateSector}
			{onRemoveSector} {onMoveSector} {onFocusSector} {onSetSectorGeometryType} {onSetHoverHighlight}
			{onClearDetectedAssets} {onAddDetectedAsset} {onRemoveTransit} {onRemoveParking} {onEditTrack}
			{onRemoveTrack} {onFinalizeTrack} {onCancelTrackEdit}
		/>
	{/snippet}
	{#snippet footer()}
		<div class="flex justify-between items-center">
			<span class="text-ui-label text-warm-gray-500 m-0!">GPS</span>
			<div class="font-mono text-micro-data text-creator-blue font-bold">
				{cragEditorState.crag.geometry.coordinates[1].toFixed(5)}
				, {cragEditorState.crag.geometry.coordinates[0].toFixed(5)}
			</div>
		</div>
	{/snippet}
</DetailsComponent>
