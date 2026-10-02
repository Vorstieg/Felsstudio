<script lang="ts">
	import type { PageProps } from './$types';
	import CragEditor from '$lib/components/editor/crag/CragEditor.svelte';

	let { data }: PageProps = $props();
	let initialSession = $derived(
		data.initialSession?.workspace
			? { ...data.initialSession, workspace: data.initialSession.workspace }
			: null
	);
</script>

<CragEditor {initialSession} />
