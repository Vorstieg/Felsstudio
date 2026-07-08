<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { userState } from '$lib/state/editor.svelte.js';
	import { isMobileViewport } from '$lib/assets/js/mobile-utils.js';
	import { resize } from '$lib/assets/js/resize.js';
	import TopoInfoPanel from './topo-properties/TopoInfoPanel.svelte';
	import TopoRoutesPanel from './topo-properties/TopoRoutesPanel.svelte';
	import TopoFixpointsPanel from './topo-properties/TopoFixpointsPanel.svelte';

	let {
		showMapModal = $bindable(false),
		drawingTarget = $bindable(null),
		activeTool = $bindable('route')
	} = $props();

	let activeTab = $state('info');
	let isMobile = $state(false);
	let lastSelectedId = $state(null);
	let lastSelectedFpId = $state(null);
	let lastSelectedTextId = $state(null);
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
		const selectedTextId = userState.ui.selectedTextLabelId;
		const lockedClusterId = userState.clustering.lockedClusterId;

		if (selectedId && selectedId !== lastSelectedId) {
			lastSelectedId = selectedId;
			const route = userState.topo.routes.find((item) => item.id === selectedId);
			if (route) {
				activeTab = 'routes';
				drawingTarget = route.type !== 'multi-pitch' ? { type: 'route', id: selectedId } : null;
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

		if (selectedTextId && selectedTextId !== lastSelectedTextId) {
			lastSelectedTextId = selectedTextId;
			activeTab = 'info';
		} else if (!selectedTextId) {
			lastSelectedTextId = null;
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
		isMobile = isMobileViewport();
		const handleResize = () => {
			isMobile = isMobileViewport();
		};
		const handleKeyDown = (event) => {
			if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'j') {
				event.preventDefault();
				toggleJsonEditor();
			}
		};

		window.addEventListener('resize', handleResize);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('resize', handleResize);
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
		userState.ui.selectedRouteId = null;
		userState.ui.selectedFixpointId = null;
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
			editorMode: parsed.editorMode || currentMode
		};
		userState.ui.selectedRouteId = null;
		userState.ui.selectedFixpointId = null;
		userState.ui.selectedTextLabelId = null;
		userState.ui.selectedOutlineId = null;
		drawingTarget = null;
		topoJsonError = '';
		formatTopoJson();
	}
</script>

<div
	class="hidden md:flex fixed top-14 right-2 z-50 w-80 flex-col"
	style="max-height: calc(100vh - {userState.clustering.lockedClusterId
		? '8.5rem'
		: '4rem'}); transition: max-height 0.2s ease-out;"
>
	<div class="panel flex flex-col flex-1 overflow-hidden shadow-panel">
		<div
			class="group flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 flex-shrink-0"
		>
			<div>
				<h1 class="text-section-title">{$_('ui.properties')}</h1>
				<p class="text-ui-label !m-0">{$_('ui.topo_inspector')}</p>
			</div>
			<button
				class="h-6 w-6 rounded-sm text-warm-gray-300 opacity-0 transition-none hover:bg-black/5 hover:text-near-black focus:opacity-100 group-hover:opacity-30"
				onclick={toggleJsonEditor}
				title="Edit topo JSON"
				aria-label="Edit topo JSON"
			>
				<i class="fa-solid fa-code text-[10px]"></i>
			</button>
		</div>

		<div
			class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 flex-shrink-0"
		>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'info'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('info')}
			>
				{$_('menu.info')}
			</button>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'routes'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('routes')}
			>
				{$_('topo.routes')}
				<span class="ml-1 text-micro-data text-warm-gray-400">{routes.length}</span>
			</button>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'fixpoints'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('fixpoints')}
			>
				{$_('ui.fixpoints')}
				<span class="ml-1 text-micro-data text-warm-gray-400">{userState.topo.fixPoints.length}</span>
			</button>
		</div>

		<div class="overflow-y-auto flex-1 p-2.5 pt-0 custom-scrollbar bg-transparent">
			<div class="flex flex-col gap-2.5 pb-2">
				{#if activeTab === 'info'}
					<TopoInfoPanel
						bind:showMapModal
						showJsonEditor={showJsonEditor}
						bind:topoJsonText
						topoJsonError={topoJsonError}
						onformatjson={formatTopoJson}
						onapplyjson={applyTopoJson}
					/>
				{:else if activeTab === 'routes'}
					<TopoRoutesPanel {routes} bind:drawingTarget bind:activeTool />
				{:else if activeTab === 'fixpoints'}
					<TopoFixpointsPanel {aiSuggestions} />
				{/if}
			</div>
		</div>
	</div>
</div>

{#if isMobile}
	<div
		use:resize
		class="fixed left-0 right-0 top-1/2 bottom-0 z-40 bg-white rounded-t-[2rem] shadow-modal border-t border-black/10 overflow-hidden"
	>
		<div class="bg-warm-gray-200 h-1.5 w-12 rounded-sm self-center mt-3 mx-auto"></div>
		<div class="relative z-20 flex gap-1 p-2 border-b border-black/5 bg-warm-white/50 mt-2">
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'info'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('info')}
				><i class="fa-solid fa-circle-info"></i></button
			>
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'routes'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('routes')}
				><i class="fa-solid fa-route"></i><span class="ml-1.5 text-[10px]">{routes.length}</span
				></button
			>
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'fixpoints'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('fixpoints')}
				><i class="fa-solid fa-location-dot"></i><span class="ml-1.5 text-[10px]"
					>{userState.topo.fixPoints.length}</span
				></button
			>
		</div>
		<div class="overflow-y-auto custom-scrollbar" style="height: calc(100% - 100px);">
			<div class="p-4 space-y-3">
				{#if activeTab === 'routes'}
					<TopoRoutesPanel {routes} bind:drawingTarget bind:activeTool mobile={true} />
				{:else if activeTab === 'fixpoints'}
					<TopoFixpointsPanel {aiSuggestions} mobile={true} />
				{:else}
					<TopoInfoPanel
						bind:showMapModal
						showJsonEditor={showJsonEditor}
						bind:topoJsonText
						topoJsonError={topoJsonError}
						onformatjson={formatTopoJson}
						onapplyjson={applyTopoJson}
						mobile={true}
					/>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.grabber.top) {
		height: 28px;
		width: 100%;
		position: absolute;
		top: 0;
		left: 0;
		cursor: pointer;
		z-index: 10;
	}
</style>
