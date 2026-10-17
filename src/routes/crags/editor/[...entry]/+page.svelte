<script lang="ts">
	import type { PageProps } from './$types';
	import CragEditor from '$lib/components/editor/crag/CragEditor.svelte';
	let { data }: PageProps = $props();
</script>

<CragEditor entryPath={data.entry} />
