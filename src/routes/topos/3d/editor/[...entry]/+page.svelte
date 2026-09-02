<script>
	import ProEditor from '$lib/components/editor/ProEditor.svelte';
	import ClusteringPanel from '$lib/components/editor/ClusteringPanel.svelte';

	let { data } = $props();
</script>

<ProEditor workspace="/topos/3d/editor" entryPath={data.entry}>
	<ClusteringPanel />
</ProEditor>
