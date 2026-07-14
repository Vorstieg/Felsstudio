<script>
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let {
		activeTool = $bindable(null),
		drawingTarget = $bindable(null),
		lassoPoints = $bindable(),
		saveStatus,
		saveError,
		combinedExport,
		clustering = $bindable()
	} = $props();

</script>
<ToolBar
	title={$_('ui.3d_studio')}
	bind:activeTool
	tools={[
				{
					id: 'ai-bolts',
					icon: 'fa-wand-magic-sparkles',
					label: $_('ui.ai-bolts'),
					hidden: !( clustering.rawHits.length > 0),
					onSelect: () => {
						activeTool = 'ai-bolts';
						drawingTarget = null;
					}
				},
				{
					id: 'route',
					icon: 'fa-route',
					label: $_('ui.route'),
					onSelect: () => {
						activeTool = 'route';
						drawingTarget = null;
					}
				},
				{
					id: 'multipitch',
					icon: 'fa-timeline',
					label: $_('ui.multipitch'),
					onSelect: () => {
						activeTool = 'multipitch';
						drawingTarget = null;
					}
				},
				{
					id: 'fixpoint',
					icon: 'fa-circle-dot',
					label: $_('ui.fixpoint'),
					onSelect: () => {
						activeTool = 'fixpoint';
						drawingTarget = null;
					}
				},
				{
					id: 'crop',
					icon: 'fa-scissors',
					label: $_('ui.crop'),
					onSelect: () => {
						activeTool = 'crop';
						drawingTarget = null;
						lassoPoints = [];
					}
				}
			]}
	onBack={() => goto(resolve("/"))}
	save={{ status: saveStatus, errorMessage: saveError, run: combinedExport }}
>
	{#snippet controls()}
		<label
			class="hidden cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 hover:bg-black/5 xl:flex"
		>
			<input
				type="checkbox"
				bind:checked={clustering.showCameraTrail}
				class="h-3 w-3 rounded-sm border border-black/15 text-creator-blue"
			/>
			<span class="text-ui-label text-warm-gray-500">{$_('ui.show_camera_trail')}</span>
		</label>
	{/snippet}
</ToolBar>