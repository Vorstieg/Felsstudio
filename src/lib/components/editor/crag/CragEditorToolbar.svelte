<script>
	import { _ } from 'svelte-i18n';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';

	let {
		activeTool = $bindable('position'),
		mapStyle = $bindable('transport'),
		currentTrackPoints = [],
		trackDraftMode = 'routing',
		isRoutingTrack = false,
		hasPendingTrackCut = false,
		onBack = () => {},
		onStartRoutingDraft = () => {},
		onHandleTrackConfirm = () => {},
		onCancelTrackEdit = () => {},
		onUndoTrackPoint = () => {},
		onConfirmTrackCut = () => {},
		onCancelTrackCut = () => {},
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
		? { label: 'Undo', run: onUndoTrackPoint, disabled: currentTrackPoints.length === 0 }
		: null}
	finish={canFinishTrack
		? { label: $_('ui.finish'), run: onHandleTrackConfirm, disabled: isRoutingTrack }
		: activeTool === 'cut' && hasPendingTrackCut
			? { label: $_('ui.finish'), run: onConfirmTrackCut }
		: null}
	cancel={activeTool === 'track'
		? { label: $_('ui.cancel'), run: onCancelTrackEdit }
		: activeTool === 'cut'
			? { label: $_('ui.cancel'), run: onCancelTrackCut }
			: null}
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
	{/snippet}
</ToolBar>
