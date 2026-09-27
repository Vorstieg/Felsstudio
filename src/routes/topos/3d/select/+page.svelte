<script lang="ts">
	import type { PageProps } from './$types';
	import WizardRouteShell from '$lib/components/editor/wizard/WizardRouteShell.svelte';

	let { data }: PageProps = $props();
</script>

<WizardRouteShell
	workspace="/topos/3d/editor"
	titleKey="ui.3d_studio"
	actionLabelKey="ui.new_or_edit"
	locations={data.locations}
/>
