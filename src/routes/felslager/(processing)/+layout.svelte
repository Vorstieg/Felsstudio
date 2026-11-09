<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import ProcessingWorkspace from '$lib/components/ProcessingWorkspace.svelte';

	let { children }: { children: Snippet } = $props();
	let mode: 'processing' | 'captures' = $derived(
		page.route.id?.includes('/reconstruct') ? 'processing' : 'captures'
	);
</script>

<ProcessingWorkspace {mode} scopedEntryPath={page.params.entry || ''} />
{@render children()}
