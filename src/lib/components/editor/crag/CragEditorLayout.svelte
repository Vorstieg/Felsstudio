<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import MapStyleControl from '$lib/components/editor/MapStyleControl.svelte';
	import CragEditorToolbar from '$lib/components/editor/crag/CragEditorToolbar.svelte';
	import CragEditorSidebar from '$lib/components/editor/crag/CragEditorSidebar.svelte';
	import CragGeometryToolOptions from '$lib/components/editor/crag/CragGeometryToolOptions.svelte';
	import CragTrackPanel from './CragTrackPanel.svelte';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import type { CragSelection } from './crag-route-types.ts';

	type Selection = CragSelection;
	type DetectedAsset = {
		id: string;
		name: string;
		kind: 'parking' | 'transit' | 'hut';
		mode: 'bus' | 'train' | null;
		coordinates: [number, number];
		distance: number;
	};
	type Props = {
		flightPlan?: FlightPlan | null;
		inspectorShadow?: boolean;
		map?: MapLibreMap | null;
		isExpanded?: boolean;
		activeTool?: string;
		toolOptionsOpen?: boolean;
		mapStyle?: 'transport' | 'satellite' | 'terrain';
		activeTab?: string;
		detectedAssets?: DetectedAsset[];
		isDetectionLoading?: boolean;
		isDetectionZoomLimited?: boolean;
		selectedObject?: Selection | null;
		saveStatus?: 'idle' | 'saving' | 'success' | 'error';
		saveError?: string;
	};
	const cragEditorState = getCragEditorSession();
	const { trackEditor, actions } = getCragEditorTools();
	const { startRoutingDraft: onStartRoutingDraft } = trackEditor;
	const {
		export: onExport,
		centerMapOnUser: onCenterMapOnUser,
		undo: onUndo,
		redo: onRedo
	} = actions;
	let {
		inspectorShadow = true,
		map,
		flightPlan = $bindable(null),
		isExpanded = false,
		activeTool = $bindable('select'),
		toolOptionsOpen = $bindable(false),
		mapStyle = $bindable('transport'),
		activeTab = $bindable('info'),
		detectedAssets = [],
		isDetectionLoading = false,
		isDetectionZoomLimited = false,
		selectedObject = $bindable(null),
		saveStatus = 'idle',
		saveError = ''
	}: Props = $props();

	let canUndo = $derived(cragEditorState.canUndo);
	let canRedo = $derived(cragEditorState.canRedo);
</script>

<CragEditorToolbar
	{map}
	bind:activeTool
	bind:toolOptionsOpen
	{onStartRoutingDraft}
	onUndo={() => void onUndo()}
	onRedo={() => void onRedo()}
	{canUndo}
	{canRedo}
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

{#if toolOptionsOpen && activeTool === 'geometry'}
	<CragGeometryToolOptions open={toolOptionsOpen} onClose={() => (toolOptionsOpen = false)} />
{/if}

{#if trackEditor.sessionActive}
	<CragTrackPanel {map} {isExpanded} bind:open={toolOptionsOpen} />
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
	bind:flightPlan
	{detectedAssets}
	{isDetectionLoading}
	{isDetectionZoomLimited}
	bind:selectedObject
	{saveStatus}
/>
