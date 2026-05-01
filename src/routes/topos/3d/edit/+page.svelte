<script>
	import ProEditor from '$lib/components/editor/ProEditor.svelte';
	import ClusteringPanel from '$lib/components/editor/ClusteringPanel.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
    import { onMount } from 'svelte';

    onMount(() => {
        userState.topo.editorMode = '3d';
    });
</script>

<ProEditor workspace="3d-edit">
	<ClusteringPanel />
</ProEditor>
