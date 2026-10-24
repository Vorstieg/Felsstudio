<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';
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
		flightPlan?: FlightPlan | null;
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
		flightPlan = $bindable(null),
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
		},
		...(cragEditorState.getActiveWorkspaceEntry()?.entry?.geometry?.type === 'Polygon'
			? [{ id: 'capture', label: 'Capture plan', icon: 'fa-helicopter' }]
			: [])
	]);
</script>

<DetailsComponent
	title="Properties"
	{tabs}
	bind:activeTab
	shadow={inspectorShadow}
	width="20rem"
>
	{#snippet children()}
		<CragEditorPanelContent
			bind:flightPlan
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
