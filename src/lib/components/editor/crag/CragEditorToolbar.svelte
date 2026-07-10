<script>
	import { _ } from 'svelte-i18n';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';

	let {
		activeTool = $bindable('position'),
		mapStyle = $bindable('transport'),
		currentTrackPoints = [],
		trackDraftMode = 'routing',
		isRoutingTrack = false,
		onBack = () => {},
		onStartRoutingDraft = () => {},
		onHandleTrackConfirm = () => {},
		onCancelTrackEdit = () => {},
		onUndoTrackPoint = () => {},
		onGpxUpload = () => {},
		onLocateUser = () => {},
		onExport = () => {},
		status = 'idle',
		errorMessage = ''
	} = $props();

	let tools = $derived([
		{ id: 'position', icon: 'fa-location-crosshairs', label: 'Crag Position' },
		{ id: 'parking', icon: 'fa-square-parking', label: 'Parking Spot' },
		{ id: 'transit', icon: 'fa-bus', label: 'Transit Station' },
		{ id: 'track', icon: 'fa-route', label: 'Approach Track', onSelect: onStartRoutingDraft },
		{
			id: 'locate',
			icon: 'fa-location-crosshairs',
			label: 'Use current location',
			onSelect: onLocateUser
		}
	]);
	let canFinishTrack = $derived(activeTool === 'track' && currentTrackPoints.length > 1);
</script>

<ToolBar
	title={$_('ui.crag_studio')}
	bind:activeTool
	{tools}
	{onBack}
	undo={activeTool === 'track'
		? { label: 'Undo point', run: onUndoTrackPoint, disabled: currentTrackPoints.length === 0 }
		: null}
	finish={canFinishTrack
		? { label: $_('ui.finish'), run: onHandleTrackConfirm, disabled: isRoutingTrack }
		: null}
	cancel={activeTool === 'track' ? { label: $_('ui.cancel'), run: onCancelTrackEdit } : null}
	save={{ status, errorMessage, run: onExport }}
>
	{#snippet controls()}
		<div
			class="hidden items-center gap-1 rounded-sm border border-black/10 bg-black/5 p-0.5 xl:flex"
		>
			{#each ['transport', 'satellite', 'terrain'] as style}
				<button
					type="button"
					onclick={() => (mapStyle = style)}
					class={`rounded-sm px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-none ${mapStyle === style ? 'bg-white text-near-black shadow-sm' : 'text-warm-gray-400 hover:bg-black/5'}`}
					>{style}</button
				>
			{/each}
		</div>
		{#if activeTool === 'track'}
			<label
				class="hidden cursor-pointer items-center gap-1.5 rounded-sm border border-black/15 bg-black/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-creator-blue hover:bg-black/10 xl:flex"
			>
				<i class="fa-solid fa-file-import"></i>Import GPX
				<input type="file" accept=".gpx" class="hidden" onchange={onGpxUpload} />
			</label>
		{/if}
	{/snippet}
</ToolBar>

{#if activeTool === 'track'}
	<label
		class="fixed right-2 top-14 z-50 cursor-pointer rounded-sm border border-black/15 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-creator-blue shadow-panel xl:hidden"
	>
		<i class="fa-solid fa-file-import mr-1.5"></i>Import GPX
		<input type="file" accept=".gpx" class="hidden" onchange={onGpxUpload} />
	</label>
{/if}
