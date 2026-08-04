<script>
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';
	import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';

	let {
		map = null,
		selectedObject = $bindable(null),
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		routeDocuments = [],
		onAddSector = () => {
		},
		onDuplicateSector = () => {
		},
		onRemoveSector = () => {
		},
		onMoveSector = () => {
		},
		onFocusSector = () => {
		},
		onSetSectorGeometryType = () => {
		},
		onAddParentRoute = () => {
		},
		onAddSectorRoute = () => {
		},
		onSelectRoute = () => {
		},
		onDeleteRoute = () => {
		},
		onPlanGenerated = () => {
		}
	} = $props();
	let selectedSector = $derived(selectedObject?.type === 'sector' ? (cragEditorState.crag.sectors || []).find((sector) => sector.id === selectedObject.id) : null);
	let parentRoutes = $derived(routeDocuments.flatMap((document) => document.sectorId ? [] : (document.data?.routes || []).map((route) => ({
		document,
		route
	}))));
	let collapsedRoutePanels = $state({});

	function sectorRoutes(sectorId) {
		return routeDocuments.flatMap((document) => document.sectorId !== sectorId ? [] : (document.data?.routes || []).map((route) => ({
			document,
			route
		})));
	}

	function routeKey(document, route) {
		return `${document.path}:${route.id}`;
	}

	function routePathCount(document, route) {
		const features = new Set((document.data?.paths?.features || []).filter((feature) => feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length > 1).map((feature) => String(feature.id)));
		return (route.pathRefs || []).filter((ref) => features.has(String(ref.pathId))).length;
	}

	function routePanelIsCollapsed(panelId) {
		return collapsedRoutePanels[panelId] !== false;
	}

	function toggleRoutePanel(panelId) {
		collapsedRoutePanels[panelId] = !routePanelIsCollapsed(panelId);
	}

	function ensureSectorCollections(sector) {
		if (!sector.type) sector.type = [];
		if (!sector.tags) sector.tags = [];
		if (!sector.topo) sector.topo = { site: '', link: '' };
		if (!sector.assets) sector.assets = { topos: [], images: [], models: [] };
		if (!sector.assets.topos) sector.assets.topos = [];
		if (!sector.assets.images) sector.assets.images = [];
		if (!sector.assets.models) sector.assets.models = [];
		if (!sector.assets.approaches) sector.assets.approaches = [];
	}

	function updateSelectedSectorId(sector, value) {
		sector.id = value;
		selectedObject = value ? { type: 'sector', id: value } : null;
	}

	function formatGeometryCenter(geometry) {
		const center = getGeometryCenter(geometry);
		return center ? `${center[1].toFixed(5)}, ${center[0].toFixed(5)}` : '';
	}

	function selectSector(sector) {
		selectedObject = { type: 'sector', id: sector.id };
		ensureSectorCollections(sector);
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
			<table class="w-full text-left text-micro-data">
				<thead class="text-warm-gray-400">
				<tr>
					<th class="pb-1 font-bold">Route</th>
					<th class="pb-1 font-bold">Type</th>
					<th class="pb-1 font-bold">Paths</th>
					<th></th>
				</tr>
				</thead>
				<tbody>
				{#each parentRoutes.slice(0, routePanelIsCollapsed('crag') ? 3 : parentRoutes.length) as { document, route }}
					<tr
						class="border-t border-black/10 {selectedObject?.type === 'route' && selectedObject.key === routeKey(document, route) ? 'bg-creator-blue/5 text-creator-blue' : ''}">
						<td>
							<button class="w-full py-1.5 text-left font-bold"
							        onclick={() => onSelectRoute(document.path, route.id)}>{route.name || 'Unnamed route'}</button>
						</td>
						<td>{route.type || 'route'}</td>
						<td>{routePathCount(document, route)}</td>
						<td>
							<button class="text-warm-gray-300 hover:text-rose-600" title="Delete route"
							        onclick={() => onDeleteRoute(document.path, route.id)}><i class="fa-solid fa-trash-can"></i>
							</button>
						</td>
					</tr>
				{/each}
				</tbody>
			</table>
			{#if parentRoutes.length > 3}
				<button
					class="mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-micro-data font-bold text-creator-blue"
					onclick={() => toggleRoutePanel('crag')}><i
					class={`fa-solid ${routePanelIsCollapsed('crag') ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>{routePanelIsCollapsed('crag') ? `Show ${parentRoutes.length - 3} more route${parentRoutes.length === 4 ? '' : 's'}` : 'Show fewer routes'}
				</button>
			{/if}
		{/if}
	</div>
	{#if !cragEditorState.crag.sectors || cragEditorState.crag.sectors.length === 0}
		<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15"><i
			class="fa-solid fa-table-cells-large text-2xl text-warm-gray-300 mb-2 block"></i>
			<p class="text-ui-label text-warm-gray-500">No Sectors</p></div>
	{/if}
	<div class="space-y-1">
		{#each cragEditorState.crag.sectors || [] as sector, i}{@const
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
						<button class="w-6 h-6 text-warm-gray-400" title="Move up"
						        onclick={(e) => { e.stopPropagation(); onMoveSector(sector.id, -1); }} disabled={i === 0}><i
							class="fa-solid fa-arrow-up text-[10px]"></i></button>
						<button class="w-6 h-6 text-warm-gray-400" title="Move down"
						        onclick={(e) => { e.stopPropagation(); onMoveSector(sector.id, 1); }}
						        disabled={i === (cragEditorState.crag.sectors || []).length - 1}><i
							class="fa-solid fa-arrow-down text-[10px]"></i></button>
					</div>
				</div>
				{#if routes.length > 0}
					<table class="mt-2 w-full border-t border-black/10 text-left text-micro-data">
						<thead class="text-warm-gray-400">
						<tr>
							<th class="py-1 font-bold">Route</th>
							<th class="py-1 font-bold">Type</th>
							<th class="py-1 font-bold">Paths</th>
							<th></th>
						</tr>
						</thead>
						<tbody>
						{#each routes.slice(0, routePanelIsCollapsed(`sector:${sector.id}`) ? 3 : routes.length) as {
							document,
							route
						}}
							<tr
								class="border-t border-black/10 {selectedObject?.type === 'route' && selectedObject.key === routeKey(document, route) ? 'bg-creator-blue/5 text-creator-blue' : ''}">
								<td>
									<button class="w-full py-1 text-left font-bold"
									        onclick={(e) => { e.stopPropagation(); onSelectRoute(document.path, route.id); }}>{route.name || 'Unnamed route'}</button>
								</td>
								<td>{route.type || 'route'}</td>
								<td>{routePathCount(document, route)}</td>
								<td>
									<button class="text-warm-gray-300 hover:text-rose-600" title="Delete route"
									        onclick={(e) => { e.stopPropagation(); onDeleteRoute(document.path, route.id); }}><i
										class="fa-solid fa-trash-can"></i></button>
								</td>
							</tr>
						{/each}
						</tbody>
					</table>
					{#if routes.length > 3}
						<button
							class="mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-micro-data font-bold text-creator-blue"
							onclick={(e) => { e.stopPropagation(); toggleRoutePanel(`sector:${sector.id}`); }}><i
							class={`fa-solid ${routePanelIsCollapsed(`sector:${sector.id}`) ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>{routePanelIsCollapsed(`sector:${sector.id}`) ? `Show ${routes.length - 3} more route${routes.length === 4 ? '' : 's'}` : 'Show fewer routes'}
						</button>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
	{#if selectedSector}{@const sector = selectedSector}{@const _normalizedSector = ensureSectorCollections(sector)}
		<div class="space-y-3 pt-3 border-t border-black/15">
			<div class="flex items-center justify-between"><h3 class="text-ui-label text-near-black !m-0">Selected Sector</h3>
				<div class="flex items-center gap-1">
					<button onclick={() => onDuplicateSector(sector.id)} class="w-7 h-7 text-warm-gray-400"
					        title="Duplicate sector"><i class="fa-solid fa-copy text-[10px]"></i></button>
					<button onclick={() => onRemoveSector(sector.id)} class="w-7 h-7 text-warm-gray-300 hover:text-rose-600"
					        title="Delete sector"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div class="space-y-0.5"><label class="text-ui-label block">Name</label><input type="text"
				                                                                               bind:value={sector.name}
				                                                                               class="input-studio w-full"
				                                                                               placeholder="Sector name" />
				</div>
				<div class="space-y-0.5"><label class="text-ui-label block">ID</label><input type="text" value={sector.id}
				                                                                             oninput={(e) => updateSelectedSectorId(sector, e.currentTarget.value)}
				                                                                             class="input-studio w-full font-mono"
				                                                                             placeholder="sector-id" /></div>
			</div>
			<div class="space-y-0.5"><label class="text-ui-label block">Geometry</label>
				<div class="grid grid-cols-2 gap-1 bg-black/5 rounded-sm p-0.5 border border-black/10">
					{#each ['Point', 'Polygon'] as type}
						<button
							class="py-1 rounded-sm text-ui-label transition-none {sector.geometry?.type === type ? 'bg-white shadow-sm text-creator-blue' : 'text-warm-gray-500 hover:bg-black/5'}"
							onclick={() => onSetSectorGeometryType(sector.id, type)}>{type}</button>
					{/each}
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<div class="space-y-0.5"><label class="text-ui-label block">Security</label><select bind:value={sector.security}
				                                                                                    class="input-studio w-full appearance-none">
					<option value="">Crag default</option>
					{#each securityOptions as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select></div>
				<div class="space-y-0.5"><label class="text-ui-label block">Rock Type</label><select
					bind:value={sector.rock_type} class="input-studio w-full appearance-none">
					<option value="">Crag default</option>
					{#each rockTypes as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select></div>
			</div>
			<div class="space-y-0.5"><label class="text-ui-label block">Sector Type</label>
				<TagSelector bind:selectedTags={sector.type} availableTags={cragTypes} />
			</div>
			<div class="space-y-0.5"><label class="text-ui-label block">Tags</label>
				<TagSelector bind:selectedTags={sector.tags} availableTags={availableTags} />
			</div>
			<div class="space-y-0.5 pt-2 border-t border-black/15"><label class="text-ui-label block">Description (DE)</label><textarea
				bind:value={sector.description_de} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label class="text-ui-label block">Description (EN)</label><textarea
				bind:value={sector.description_en} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label class="text-ui-label block">Approach (DE)</label><textarea
				bind:value={sector.approach_de} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label class="text-ui-label block">Approach (EN)</label><textarea
				bind:value={sector.approach_en} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="flex items-center justify-between bg-white rounded-sm border border-black/15 p-2"><span
				class="text-ui-label text-warm-gray-500 !m-0">{sector.geometry?.type === 'Polygon' ? 'Center' : 'Position'}</span>
				{#if formatGeometryCenter(sector.geometry)}<span
					class="font-mono text-micro-data text-creator-blue font-bold">{formatGeometryCenter(sector.geometry)}</span>{:else}
					<span class="text-micro-data text-warm-gray-400">Crag default</span>{/if}
			</div>
			<CragFlightPlanPanel {sector} cragName={cragEditorState.crag.name} {map} onPlanGenerated={onPlanGenerated} />
		</div>
	{/if}
</div>
