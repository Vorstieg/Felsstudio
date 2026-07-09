<script>
	import WizardRouteShell from '$lib/components/editor/wizard/WizardRouteShell.svelte';

	let { data } = $props();
</script>

<WizardRouteShell
	workspace="topos/gpx/editor"
	titleKey="ui.gpx_studio"
	actionLabelKey="ui.new_or_edit"
	locations={data.locations}
/>
