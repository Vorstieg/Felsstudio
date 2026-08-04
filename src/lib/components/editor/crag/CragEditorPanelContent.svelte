<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.js';
	const cragEditorState = getCragEditorSession();
	import CragEditorInfoTab from './CragEditorInfoTab.svelte';
	import CragEditorRegistryTab from './CragEditorRegistryTab.svelte';
	import CragEditorSectorsTab from './CragEditorSectorsTab.svelte';

	let {
		showTabs = true,
		map = null,
		activeTab = $bindable('info'),
		detectedAssets = [],
		activeTrackTarget = null,
		selectedObject = $bindable(null),
		saveStatus = 'idle'
	} = $props();
</script>

{#if showTabs}
	<div class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 flex-shrink-0">
		<button class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'info' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}" onclick={() => activeTab = 'info'}>
			<i class="fa-solid fa-circle-info mr-1.5"></i> Metadata
		</button>
		<button class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'registry' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}" onclick={() => activeTab = 'registry'}>
			<i class="fa-solid fa-layer-group mr-1.5"></i> Registry <span class="ml-1 text-micro-data">{cragEditorState.access?.features?.length || 0}</span>
		</button>
		<button class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'sectors' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}" onclick={() => activeTab = 'sectors'}>
			<i class="fa-solid fa-table-cells-large mr-1.5"></i> Sectors <span class="ml-1 text-micro-data">{cragEditorState.crag.sectors?.length || 0}</span>
		</button>
	</div>
{/if}

<div class="overflow-y-auto flex-1 p-3 pt-0 custom-scrollbar bg-transparent">
	{#if activeTab === 'info'}
		<CragEditorInfoTab {saveStatus} />
	{:else if activeTab === 'registry'}
		<CragEditorRegistryTab {detectedAssets} {activeTrackTarget} />
	{:else}
		<CragEditorSectorsTab {map} bind:selectedObject />
	{/if}
</div>
