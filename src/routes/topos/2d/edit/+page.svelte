<script>
	import ProEditor from '$lib/components/editor/ProEditor.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
    import { onMount } from 'svelte';

    onMount(() => {
        userState.topo.editorMode = '2d';
    });
</script>

<ProEditor workspace="2d-edit" />
