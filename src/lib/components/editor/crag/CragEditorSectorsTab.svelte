<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.ts';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	const cragEditorState = getCragEditorSession();
	const { sectorTool, routeTool, actions } = getCragEditorTools();
	const {
		createSector: onAddSector, duplicateSector: onDuplicateSector, removeSector: onRemoveSector,
		focusSector: onFocusSector
	} = sectorTool;
	const { addRoute: onAddSectorRoute, selectRoute: onSelectRoute, deleteRoute: onDeleteRoute } = routeTool;
	const onAddParentRoute = () => routeTool.addRoute();
	const onPlanGenerated = actions.handleFlightPlanGenerated;
	let routeDocuments = $derived(cragEditorState.routeDocuments);
	import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';
	import CragEditorRouteTable from './CragEditorRouteTable.svelte';

	let {
		map = null,
		selectedObject = $bindable(null)
	} = $props();
	let parentRoutes = $derived(routeDocuments.flatMap((document) => document.sectorId ? [] : (document.data?.routes || []).map((route) => ({
		document,
		route
	}))));

	function sectorRoutes(sectorId) {
		return routeDocuments.flatMap((document) => document.sectorId !== sectorId ? [] : (document.data?.routes || []).map((route) => ({
			document,
			route
		})));
	}

	function selectSector(sector) {
		selectedObject = { type: 'sector', id: sector.id };
		onFocusSector(sector);
	}

</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between">
		<div><h3 class="text-ui-label text-near-black !m-0">Sectors</h3>
			<p class="text-micro-data text-warm-gray-400">Optional wall sections inside this crag</p></div>
		<button onclick={onAddSector}
		        class="w-7 h-7 rounded-sm bg-creator-blue text-white flex items-center justify-center hover:bg-creator-blue-active"
		        title="Add sector"><i class="fa-solid fa-plus text-[10px]"></i></button>
	</div>
	<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2">
		<div class="mb-2 flex items-center justify-between">
			<div class="text-ui-label text-warm-gray-500">Crag routes</div>
			<button
				class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue hover:bg-creator-blue hover:text-white"
				onclick={onAddParentRoute}><i class="fa-solid fa-route mr-1"></i>+ Route
			</button>
		</div>
		{#if parentRoutes.length === 0}<p class="text-micro-data text-warm-gray-400">No parent routes.</p>{:else}
			<CragEditorRouteTable routes={parentRoutes} {selectedObject} {onSelectRoute} {onDeleteRoute} />
		{/if}
	</div>
	{#if !cragEditorState.crag.sectors || cragEditorState.crag.sectors.length === 0}
		<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15"><i
			class="fa-solid fa-table-cells-large text-2xl text-warm-gray-300 mb-2 block"></i>
			<p class="text-ui-label text-warm-gray-500">No Sectors</p></div>
	{/if}
	<div class="space-y-1">
		{#each cragEditorState.crag.sectors || [] as sector}{@const
			isSelected = selectedObject?.type === 'sector' && selectedObject.id === sector.id}{@const
			routes = sectorRoutes(sector.id)}
			<div
				class="w-full panel-inner p-2 text-left border-black/10 hover:border-creator-blue cursor-pointer {isSelected ? 'border-creator-blue bg-creator-blue/5' : ''}"
				role="button" tabindex="0" onclick={() => selectSector(sector)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSector(sector); } }}>
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<div class="text-body-text font-bold truncate">{sector.name || sector.id || 'Unnamed Sector'}</div>
						<div class="text-micro-data text-warm-gray-400 truncate">{sector.id || 'missing-id'}</div>
					</div>
						<div class="flex items-center gap-1">
							<button class="h-6 rounded-sm px-1.5 text-[10px] font-bold text-creator-blue"
							        title="Add route to this sector"
							        onclick={(e) => { e.stopPropagation(); onAddSectorRoute(sector.id); }}><i
								class="fa-solid fa-route mr-1"></i>+ Route
							</button>
							<button onclick={(e) => { e.stopPropagation(); onDuplicateSector(sector.id); }}
							        class="h-6 w-6 text-warm-gray-400 hover:text-creator-blue"
							        title="Duplicate sector"><i class="fa-solid fa-copy text-[10px]"></i></button>
							<button onclick={(e) => { e.stopPropagation(); onRemoveSector(sector.id); }}
							        class="h-6 w-6 text-warm-gray-300 hover:text-rose-600"
							        title="Delete sector"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
						</div>
					</div>
					{#if routes.length > 0}
						<div class="mt-2 border-t border-black/10">
							<CragEditorRouteTable routes={routes} {selectedObject} {onSelectRoute} {onDeleteRoute} />
						</div>
					{/if}
					{#if isSelected}
						<div onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
							<CragFlightPlanPanel {sector} cragName={cragEditorState.crag.name} {map} onPlanGenerated={onPlanGenerated} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
