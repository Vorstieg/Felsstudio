<script>
	import WizardRouteShell from '$lib/components/editor/wizard/WizardRouteShell.svelte';

	let { data } = $props();
</script>

<WizardRouteShell
	workspace="crags/editor"
	titleKey="ui.crag_studio"
	actionLabelKey="ui.new_crag"
	locations={data.locations}
/>
