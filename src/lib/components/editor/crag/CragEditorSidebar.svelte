<script>
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import DetailsComponent from '../DetailsComponent.svelte';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	let {
		inspectorShadow = true, map = null, activeTab = $bindable('info'), detectedAssets = [], editingTrackIndex = null,
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
		}, onRemoveAccessFeature = () => {
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
		}, onAddRoutePath = () => {
		}, onEditRoutePath = () => {
		}, onUpdateRoutePath = () => {
		}, onRemoveRoutePath = () => {
		}, onDeleteRoute = () => {
		}, onPlanGenerated = () => {
		}
	} = $props();

	let tabs = $derived([
		{ id: 'info', label: 'Metadata', icon: 'fa-circle-info' },
		{
			id: 'registry',
			label: 'Registry',
			icon: 'fa-layer-group',
			count: (cragEditorState.access?.features || []).length
		},
		{ id: 'sectors', label: 'Sectors', icon: 'fa-table-cells-large', count: cragEditorState.crag.sectors?.length || 0 }
	]);
</script>

<DetailsComponent title="Properties" subtitle="Crag Inspector" {tabs} bind:activeTab shadow={inspectorShadow}
                  width="20rem">
	{#snippet children()}
		<CragEditorPanelContent
			bind:activeTab bind:selectedSectorId showTabs={false} {map} {detectedAssets} {editingTrackIndex} {cragTypes}
				{routeDocuments} {selectedRouteKey} {onAddParentRoute} {onAddSectorRoute} {onSelectRoute} {onUpdateRouteName} {onUpdateRoute} {onAddRoutePath} {onEditRoutePath} {onUpdateRoutePath} {onRemoveRoutePath} {onDeleteRoute} {onPlanGenerated}
			{availableTags}
			{securityOptions} {rockTypes} {commonEquipment} {saveStatus} {onAddEquipmentItem}
			{onRemoveEquipmentItem} {onAddCragImages} {onRemoveCragImage} {onAddSector} {onDuplicateSector}
			{onRemoveSector} {onMoveSector} {onFocusSector} {onSetSectorGeometryType} {onSetHoverHighlight}
			{onClearDetectedAssets} {onAddDetectedAsset} {onRemoveAccessFeature} {onEditTrack}
			{onRemoveTrack} {onFinalizeTrack} {onCancelTrackEdit}
		/>
	{/snippet}
</DetailsComponent>
