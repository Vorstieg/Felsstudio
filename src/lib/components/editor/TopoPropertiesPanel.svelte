<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import type { Route } from '@vorstieg/fels-types/types';
	import type { Topo2DEditorDocument } from '$lib/state/topo-2d-editor-initial-state.ts';
	import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
	const editorState = getTopo2DEditorState();
	let topo = $derived(editorState.topo);
	const ui = editorState.ui;
	import DetailsComponent from './DetailsComponent.svelte';
	import TopoInfoPanel from './topo-properties/TopoInfoPanel.svelte';
	import TopoRoutesPanel from './topo-properties/routes/TopoRoutesPanel.svelte';
	import TopoFixpointsPanel from './topo-properties/TopoFixpointsPanel.svelte';

	type Props = {
		showMapModal?: boolean;
		drawingTarget?: TopoDrawingTarget | null;
		activeTool?: string;
		toolOptionsOpen?: boolean;
	};

	let {
		showMapModal = $bindable(false),
		drawingTarget = $bindable(null),
		activeTool = $bindable('route'),
		toolOptionsOpen = $bindable(false)
	}: Props = $props();

	let activeTab = $state('info');
	let lastSelectedId = $state<string | number | null>(null);
	let lastSelectedFpId = $state<string | number | null>(null);
	let lastLockedClusterId = $state<string | number | null>(null);
	let showJsonEditor = $state(false);
	let topoJsonText = $state('');
	let topoJsonError = $state('');
	const hasRouteType = (route: Route, type: string) =>
		Array.isArray(route.type) ? route.type.includes(type) : route.type === type;

	let routes = $derived(topo.routes);
	let aiSuggestions = $derived.by(() => {
		if (activeTool !== 'ai-bolts' || !editorState.clustering.clusters) return [];
		return editorState.clustering.clusters.filter((cluster) => {
			return !topo.fixPoints.some((fixpoint) => {
				if (!Array.isArray(fixpoint.position3D) || fixpoint.position3D.length < 3) return false;
				const dist = Math.sqrt(
					Math.pow(fixpoint.position3D[0] - cluster.anchor[0], 2) +
						Math.pow(fixpoint.position3D[1] - cluster.anchor[1], 2) +
						Math.pow(fixpoint.position3D[2] - cluster.anchor[2], 2)
				);
				return dist < 0.1;
			});
		});
	});

	$effect(() => {
		const selectedId = ui.selectedRouteId;
		const selectedFpId = ui.selectedFixpointId;
		const lockedClusterId = editorState.clustering.lockedClusterId;

		if (selectedId && selectedId !== lastSelectedId) {
			lastSelectedId = selectedId;
			const route = topo.routes.find((item) => String(item.id) === String(selectedId));
			if (route) {
				activeTool = 'routeEdit';
				activeTab = 'routes';
				if (hasRouteType(route, 'multi-pitch')) {
					drawingTarget = drawingTarget?.routeId === selectedId ? drawingTarget : null;
				} else {
					drawingTarget = { type: 'route', routeId: selectedId };
				}
				scrollIntoInspectorView('route-' + selectedId);
			}
		} else if (!selectedId) {
			lastSelectedId = null;
			if (drawingTarget?.type === 'route') drawingTarget = null;
		}

		if (selectedFpId && selectedFpId !== lastSelectedFpId) {
			lastSelectedFpId = selectedFpId;
			activeTab = 'fixpoints';
			scrollIntoInspectorView('fixpoint-' + selectedFpId);
		} else if (!selectedFpId) {
			lastSelectedFpId = null;
		}

		if (lockedClusterId && lockedClusterId !== lastLockedClusterId) {
			lastLockedClusterId = lockedClusterId;
			activeTab = 'fixpoints';
			scrollIntoInspectorView('ai-bolt-' + lockedClusterId);
		} else if (!lockedClusterId) {
			lastLockedClusterId = null;
		}
	});

	onMount(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'j') {
				event.preventDefault();
				toggleJsonEditor();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	function scrollIntoInspectorView(id: string) {
		setTimeout(() => {
			document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 100);
	}

	function switchTab(tab: string) {
		activeTab = tab;
		editorState.clearSelection();
	}

	function formatTopoJson() {
		topoJsonText = JSON.stringify($state.snapshot(topo), null, 2);
		topoJsonError = '';
	}

	function toggleJsonEditor() {
		showJsonEditor = !showJsonEditor;
		if (showJsonEditor) {
			activeTab = 'info';
			formatTopoJson();
		}
	}

	function applyTopoJson() {
		let parsed: unknown;
		try {
			parsed = JSON.parse(topoJsonText);
		} catch (error) {
			topoJsonError = error instanceof Error ? error.message : String(error);
			return;
		}

		if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
			topoJsonError = 'Topo JSON must be an object.';
			return;
		}

		const currentMode = editorState.ui.editorMode;
		editorState.load(parsed as Topo2DEditorDocument);
		editorState.ui.editorMode = currentMode;
		editorState.clearSelection();
		drawingTarget = null;
		topoJsonError = '';
		formatTopoJson();
	}

	let tabs = $derived([
		{ id: 'info', label: $_('menu.info'), icon: 'fa-circle-info' },
		{ id: 'routes', label: $_('topo.routes'), icon: 'fa-route', count: routes.length },
		{
			id: 'fixpoints',
			label: $_('ui.fixpoints'),
			icon: 'fa-location-dot',
			count: topo.fixPoints.length
		}
	]);
</script>

<DetailsComponent
	title={$_('ui.properties')}
	subtitle={$_('ui.topo_inspector')}
	{tabs}
	bind:activeTab
	onTabChange={switchTab}
	width="20rem"
	visualSuperseded={false}
>
	{#snippet headerActions()}
		<button
			class="h-6 w-6 rounded-sm text-warm-gray-300 hover:bg-black/5 hover:text-near-black"
			onclick={toggleJsonEditor}
			title="Edit topo JSON"
			aria-label="Edit topo JSON"><i class="fa-solid fa-code text-[10px]"></i></button
		>
	{/snippet}
	{#snippet children({ mobile })}
		<div class="flex flex-col gap-2.5 pb-2">
			{#if activeTab === 'info'}
				<TopoInfoPanel
					bind:showMapModal
					{showJsonEditor}
					bind:topoJsonText
					{topoJsonError}
					onformatjson={formatTopoJson}
					onapplyjson={applyTopoJson}
				/>
			{:else if activeTab === 'routes'}
				<TopoRoutesPanel {routes} bind:drawingTarget bind:activeTool {mobile} />
			{:else if activeTab === 'fixpoints'}
				<TopoFixpointsPanel {aiSuggestions} {mobile} />
			{/if}
		</div>
	{/snippet}
</DetailsComponent>
