<script>
	import CragEditor from '$lib/components/editor/crag/CragEditor.svelte';

	let { data } = $props();
</script>

<CragEditor initialSession={data.initialSession} />
