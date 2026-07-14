<script>
	import WizardRouteShell from '$lib/components/editor/wizard/WizardRouteShell.svelte';

	let { data } = $props();
</script>

<WizardRouteShell
	workspace="/topos/2d/editor"
	titleKey="ui.2d_studio"
	actionLabelKey="ui.new_or_edit"
	locations={data.locations}
/>
