<script>
	import Topo2DEditorPage from '../+page.svelte';

	let { data } = $props();
</script>

<Topo2DEditorPage entryPath={data.entry} />
