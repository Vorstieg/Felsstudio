<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	const userState = getTopoEditorSession();
	const editorState = getTopo2DEditorState();
	import DetailsComponent from './DetailsComponent.svelte';
	import TopoInfoPanel from './topo-properties/TopoInfoPanel.svelte';
	import TopoRoutesPanel from './topo-properties/TopoRoutesPanel.svelte';
	import TopoFixpointsPanel from './topo-properties/TopoFixpointsPanel.svelte';

	let {
		showMapModal = $bindable(false),
		drawingTarget = $bindable(null),
		activeTool = $bindable('route'),
		toolOptionsOpen = false
	} = $props();

	let activeTab = $state('info');
	let lastSelectedId = $state(null);
	let lastSelectedFpId = $state(null);
	let lastLockedClusterId = $state(null);
	let showJsonEditor = $state(false);
	let topoJsonText = $state('');
	let topoJsonError = $state('');

	let routes = $derived(userState.topo.routes);
	let aiSuggestions = $derived.by(() => {
		if (activeTool !== 'ai-bolts' || !userState.clustering.clusters) return [];
		return userState.clustering.clusters.filter((cluster) => {
			return !userState.topo.fixPoints.some((fixpoint) => {
				if (!Array.isArray(fixpoint.position) || fixpoint.position.length < 3) return false;
				const dist = Math.sqrt(
					Math.pow(fixpoint.position[0] - cluster.anchor[0], 2) +
						Math.pow(fixpoint.position[1] - cluster.anchor[1], 2) +
						Math.pow(fixpoint.position[2] - cluster.anchor[2], 2)
				);
				return dist < 0.1;
			});
		});
	});

	$effect(() => {
		const selectedId = userState.ui.selectedRouteId;
		const selectedFpId = userState.ui.selectedFixpointId;
		const lockedClusterId = userState.clustering.lockedClusterId;

		if (selectedId && selectedId !== lastSelectedId) {
			lastSelectedId = selectedId;
			const route = userState.topo.routes.find((item) => item.id === selectedId);
			if (route) {
				activeTab = 'routes';
				if (route.type === 'multi-pitch') {
					drawingTarget = drawingTarget?.routeId === selectedId ? drawingTarget : null;
				} else {
					drawingTarget = { type: 'route', id: selectedId };
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
		const handleKeyDown = (event) => {
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

	function scrollIntoInspectorView(id) {
		setTimeout(() => {
			document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 100);
	}

	function switchTab(tab) {
		activeTab = tab;
		if (editorState) editorState.clearSelection();
		else {
			userState.ui.selectedRouteId = null;
			userState.ui.selectedFixpointId = null;
		}
	}

	function formatTopoJson() {
		topoJsonText = JSON.stringify($state.snapshot(userState.topo), null, 2);
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
		let parsed;
		try {
			parsed = JSON.parse(topoJsonText);
		} catch (error) {
			topoJsonError = error.message;
			return;
		}

		if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
			topoJsonError = 'Topo JSON must be an object.';
			return;
		}

		const currentMode = userState.topo.editorMode;
		userState.topo = {
			...parsed,
			routes: Array.isArray(parsed.routes) ? parsed.routes : [],
			fixPoints: Array.isArray(parsed.fixPoints) ? parsed.fixPoints : [],
			outlines: Array.isArray(parsed.outlines) ? parsed.outlines : [],
			textLabels: Array.isArray(parsed.textLabels) ? parsed.textLabels : [],
			tags: Array.isArray(parsed.tags) ? parsed.tags : [],
			coordinates: Array.isArray(parsed.coordinates) ? parsed.coordinates : [0, 0],
			modelOffset: Array.isArray(parsed.modelOffset) ? parsed.modelOffset : [0, 0, 0],
			scale: parsed.scale ?? 1,
			image2D: parsed.image2D ?? null,
			imageAspectRatio: parsed.imageAspectRatio ?? 1.5,
			canvasAspectRatio:
				Number.isFinite(Number(parsed.canvasAspectRatio)) && Number(parsed.canvasAspectRatio) > 0
					? Number(parsed.canvasAspectRatio)
					: Number.isFinite(Number(parsed.imageAspectRatio)) && Number(parsed.imageAspectRatio) > 0
						? Number(parsed.imageAspectRatio)
						: 1.5,
			backgroundFit: parsed.backgroundFit === 'cover' ? 'cover' : 'contain',
			editorMode: parsed.editorMode || currentMode
		};
		if (editorState) editorState.clearSelection();
		else {
			userState.ui.selectedRouteId = null;
			userState.ui.selectedFixpointId = null;
			userState.ui.selectedTextLabelId = null;
			userState.ui.selectedOutlineId = null;
		}
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
			count: userState.topo.fixPoints.length
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
	visualSuperseded={toolOptionsOpen}
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
					{mobile}
				/>
			{:else if activeTab === 'routes'}
				<TopoRoutesPanel {routes} bind:drawingTarget bind:activeTool {mobile} />
			{:else if activeTab === 'fixpoints'}
				<TopoFixpointsPanel {aiSuggestions} {mobile} />
			{/if}
		</div>
	{/snippet}
</DetailsComponent>
