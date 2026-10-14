<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	const { trackEditor } = getCragEditorTools();
	type Action = () => void | Promise<void>;
	type Props = {
		map?: MapLibreMap | null;
		activeTool?: string;
		toolOptionsOpen?: boolean;
		onStartRoutingDraft?: Action;
		onUndo?: Action;
		onRedo?: Action;
		canUndo?: boolean;
		canRedo?: boolean;
		onExport?: Action;
		status?: 'idle' | 'saving' | 'success' | 'error';
		errorMessage?: string;
	};

	let {
		map = null,
		activeTool = $bindable('select'),
		toolOptionsOpen = $bindable(false),
		onStartRoutingDraft = () => {},
		onUndo = () => {},
		onRedo = () => {},
		canUndo = false,
		canRedo = false,
		onExport = () => {},
		status = 'idle',
		errorMessage = ''
	}: Props = $props();

	let tools = $derived([
		{ id: 'select', icon: 'fa-arrow-pointer', label: 'Select' },
		{
			id: 'geometry',
			icon: 'fa-draw-polygon',
			label: 'Edit Geometry',
			hasOptions: true,
			openOptionsOnSelect: true
		},
		{ id: 'parking', icon: 'fa-square-parking', label: 'Parking Spot' },
		{ id: 'hut', icon: 'fa-house', label: 'Mountain Hut' },
		{ id: 'transit', icon: 'fa-bus', label: 'Transit Station' },
		{
			id: 'track',
			icon: 'fa-route',
			label: $_('track.title'),
			openOptionsOnSelect: true,
			hasOptions: true,
			onSelect: ({ isActive }: { isActive: boolean }) => {
				if (!isActive) onStartRoutingDraft();
			}
		}
	]);
	let primaryAction = $derived(trackEditor.primaryAction);
	let cancelAction = $derived(trackEditor.cancelAction);
</script>

<ToolBar
	bind:activeTool
	bind:toolOptionsOpen
	neutralTool="select"
	{tools}
	requestToolChange={(tool, select) => {
		if (tool.id === 'track' && trackEditor.sessionActive) {
			toolOptionsOpen = true;
			return;
		}
		trackEditor.requestLeave(select);
	}}
	undo={trackEditor.sessionActive
		? {
				label: $_('track.undo'),
				run: () => {
					trackEditor.undoTrackPoint();
				},
				disabled: !trackEditor.canUndo
			}
		: canUndo
			? { label: 'Undo', run: onUndo }
			: null}
	redo={trackEditor.sessionActive
		? {
				label: $_('track.redo'),
				run: () => {
					trackEditor.redoTrackPoint();
				},
				disabled: !trackEditor.canRedo
			}
		: canRedo
			? { label: 'Redo', run: onRedo }
			: null}
	finish={primaryAction?.placement === 'toolbar'
		? { ...primaryAction, label: $_(primaryAction.label), keepActive: true }
		: null}
	cancel={cancelAction
		? { ...cancelAction, label: $_(cancelAction.label), keepActive: true }
		: null}
	save={{ status, errorMessage, run: onExport }}
>
	{#snippet mobileSearch()}
		<MapSearch {map} embedded />
	{/snippet}
</ToolBar>
