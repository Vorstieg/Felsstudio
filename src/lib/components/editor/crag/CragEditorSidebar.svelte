<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	const cragEditorState = getCragEditorSession();
	import DetailsComponent from '../DetailsComponent.svelte';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	type DetectedAsset = {
		id: string;
		name: string;
		kind: 'parking' | 'transit' | 'hut';
		mode: 'bus' | 'train' | null;
		coordinates: [number, number];
		distance: number;
	};
	type SelectedObject = import('./crag-route-types.ts').CragSelection;
	type SaveStatus = 'idle' | 'saving' | 'success' | 'error';
	type Props = {
		inspectorShadow?: boolean;
		map?: MapLibreMap | null;
		activeTab?: string;
		detectedAssets?: DetectedAsset[];
		isDetectionLoading?: boolean;
		isDetectionZoomLimited?: boolean;
		selectedObject?: SelectedObject | null;
		saveStatus?: SaveStatus;
	};

	let {
		inspectorShadow = true,
		map = null,
		activeTab = $bindable('info'),
		detectedAssets = [],
		isDetectionLoading = false,
		isDetectionZoomLimited = false,
		selectedObject = $bindable(null),
		saveStatus = 'idle'
	}: Props = $props();

	let tabs = $derived([
		{ id: 'info', label: 'Metadata', icon: 'fa-circle-info' },
		{
			id: 'registry',
			label: 'Registry',
			icon: 'fa-layer-group',
			count: (cragEditorState.getWorkspaceAccess()?.features || []).length
		},
		{
			id: 'sectors',
			label: 'Children',
			icon: 'fa-table-cells-large',
			count: cragEditorState.getActiveSectors().length
		}
	]);
</script>

<DetailsComponent
	title="Properties"
	subtitle="Crag Inspector"
	{tabs}
	bind:activeTab
	shadow={inspectorShadow}
	width="20rem"
>
	{#snippet children()}
		<CragEditorPanelContent
			bind:activeTab
			bind:selectedObject
			showTabs={false}
			{map}
			{detectedAssets}
			{isDetectionLoading}
			{isDetectionZoomLimited}
			{saveStatus}
		/>
	{/snippet}
</DetailsComponent>
