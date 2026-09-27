<script lang="ts">
	import type { PageProps } from './$types';
	import Topo2DEditorPage from '../+page.svelte';

	let { data }: PageProps = $props();
</script>

<Topo2DEditorPage entryPath={data.entry} />
