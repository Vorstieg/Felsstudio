<script lang="ts">
	import type { PageProps } from './$types';
	import WizardRouteShell from '$lib/components/editor/wizard/WizardRouteShell.svelte';

	let { data }: PageProps = $props();
</script>

<WizardRouteShell
	workspace="/topos/2d/editor"
	titleKey="ui.2d_studio"
	actionLabelKey="ui.new_or_edit"
	locations={data.locations}
/>
