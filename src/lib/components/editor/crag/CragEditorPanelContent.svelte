<script lang="ts">
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import CragEditorInfoTab from './CragEditorInfoTab.svelte';
	import CragEditorRegistryTab from './CragEditorRegistryTab.svelte';
	import CragEditorSectorsTab from './CragEditorSectorsTab.svelte';
	import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import type { CragSelection } from './crag-route-types.ts';
	const cragEditorState = getCragEditorSession();
	const { actions } = getCragEditorTools();

	type DetectedAsset = {
		id: string;
		name: string;
		kind: 'parking' | 'transit' | 'hut';
		mode: 'bus' | 'train' | null;
		coordinates: [number, number];
		distance: number;
	};
	type SelectedObject = CragSelection;
	type SaveStatus = 'idle' | 'saving' | 'success' | 'error';
	type Props = {
		flightPlan?: FlightPlan | null;
		showTabs?: boolean;
		map?: MapLibreMap | null;
		activeTab?: string;
		detectedAssets?: DetectedAsset[];
		isDetectionLoading?: boolean;
		isDetectionZoomLimited?: boolean;
		selectedObject?: SelectedObject | null;
		saveStatus?: SaveStatus;
	};

	let {
		showTabs = true,
		map = null,
		flightPlan = $bindable(null),
		activeTab = $bindable('info'),
		detectedAssets = [],
		isDetectionLoading = false,
		isDetectionZoomLimited = false,
		selectedObject = $bindable(null),
		saveStatus = 'idle'
	}: Props = $props();
	let activeWorkspace = $derived(cragEditorState.getActiveWorkspaceEntry());
	let activeEntryProperties = $derived(activeWorkspace?.entry?.properties);
	let activeFlightPlanEntry = $derived({
		id: activeEntryProperties?.id,
		name: activeEntryProperties?.name,
		geometry: activeWorkspace?.entry?.geometry
	});
	let isPolygonEntry = $derived(activeWorkspace?.entry?.geometry?.type === 'Polygon');
</script>

{#if showTabs}
	<div
		class="bg-black/5 rounded-sm p-0.5 border border-black/10 {isPolygonEntry
			? 'grid grid-cols-2'
			: 'flex'} gap-0.5 mx-3 mb-2 flex-shrink-0"
	>
		<button
			class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'info'
				? 'bg-white shadow-sm text-near-black'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTab = 'info')}
		>
			<i class="fa-solid fa-circle-info mr-1.5"></i> Metadata
		</button>
		<button
			class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'registry'
				? 'bg-white shadow-sm text-near-black'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTab = 'registry')}
		>
			<i class="fa-solid fa-layer-group mr-1.5"></i> Registry
			<span class="ml-1 text-micro-data"
				>{cragEditorState.getWorkspaceAccess()?.features?.length || 0}</span
			>
		</button>
		<button
			class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'sectors'
				? 'bg-white shadow-sm text-near-black'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTab = 'sectors')}
		>
			<i class="fa-solid fa-table-cells-large mr-1.5"></i> Children
			<span class="ml-1 text-micro-data">{cragEditorState.getActiveSectors().length}</span>
		</button>
		{#if isPolygonEntry}
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'capture'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => (activeTab = 'capture')}
			>
				<i class="fa-solid fa-helicopter mr-1.5"></i> Capture plan
			</button>
		{/if}
	</div>
{/if}

<div class="overflow-y-auto flex-1 p-3 pt-0 custom-scrollbar bg-transparent">
	{#if activeTab === 'info'}
		<CragEditorInfoTab {saveStatus} />
	{:else if activeTab === 'registry'}
		<CragEditorRegistryTab
			{detectedAssets}
			{isDetectionLoading}
			{isDetectionZoomLimited}
			bind:selectedObject
		/>
	{:else if activeTab === 'sectors'}
		<CragEditorSectorsTab bind:selectedObject />
	{:else if activeTab === 'capture' && isPolygonEntry}
		<div class="space-y-1">
			<p class="text-micro-data text-warm-gray-400">
				Plan a façade mission for {activeEntryProperties?.name ||
					activeEntryProperties?.id ||
					'this entry'}.
			</p>
			{#key cragEditorState.activeWorkspaceEntryPath}
				<CragFlightPlanPanel
					bind:plan={flightPlan}
					entry={activeFlightPlanEntry}
					entryName={activeEntryProperties?.name || activeEntryProperties?.id || ''}
					{map}
					onPlanGenerated={actions.handleFlightPlanGenerated}
				/>
			{/key}
		</div>
	{:else}
		<CragEditorInfoTab {saveStatus} />
	{/if}
</div>
