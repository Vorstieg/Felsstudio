<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.js';
	const cragEditorState = getCragEditorSession();
	import DetailsComponent from '../DetailsComponent.svelte';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	let {
		inspectorShadow = true, map = null, activeTab = $bindable('info'), detectedAssets = [], activeTrackTarget = null,
		selectedObject = $bindable(null), saveStatus = 'idle'
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
			bind:activeTab bind:selectedObject showTabs={false} {map} {detectedAssets} {activeTrackTarget} {saveStatus}
		/>
	{/snippet}
</DetailsComponent>
