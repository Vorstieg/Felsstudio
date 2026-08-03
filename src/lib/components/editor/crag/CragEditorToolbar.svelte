<script>
	import { _ } from 'svelte-i18n';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';
	import MapSearch from '$lib/components/editor/MapSearch.svelte';

	let {
		map = null,
		activeTool = $bindable('position'),
		toolOptionsOpen = $bindable(false),
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
		onExport = () => {},
		status = 'idle',
		errorMessage = ''
	} = $props();

	let tools = $derived([
		{ id: 'position', icon: 'fa-location-crosshairs', label: 'Crag Position' },
		{ id: 'parking', icon: 'fa-square-parking', label: 'Parking Spot' },
		{ id: 'transit', icon: 'fa-bus', label: 'Transit Station' },
		{
			id: 'track',
			icon: 'fa-route',
			label: 'Approach Track',
			hasOptions: true,
			onSelect: ({ isActive }) => {
				if (!isActive) onStartRoutingDraft();
			}
		},
	]);
	let canFinishTrack = $derived(activeTool === 'track' && currentTrackPoints.length > 1);
</script>

<ToolBar
	bind:activeTool
	bind:toolOptionsOpen
	neutralTool="position"
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
	{#snippet mobileSearch()}
		<MapSearch {map} embedded />
	{/snippet}
</ToolBar>
