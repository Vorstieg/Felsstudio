<script>
	import { getCragEditorSession } from '$lib/state/crag-session.svelte.js';
	import { getCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	import { availableTags, cragTypes, securityOptions } from './crag-editor-options.js';
	import { rockTypes } from '$lib/config.js';
	const cragEditorState = getCragEditorSession();
	const { sectorTool, routeTool, actions } = getCragEditorTools();
	const {
		createSector: onAddSector, duplicateSector: onDuplicateSector, removeSector: onRemoveSector,
		moveSector: onMoveSector, focusSector: onFocusSector,
		setSectorGeometryType: onSetSectorGeometryType
	} = sectorTool;
	const { addRoute: onAddSectorRoute, selectRoute: onSelectRoute, deleteRoute: onDeleteRoute } = routeTool;
	const onAddParentRoute = () => routeTool.addRoute();
	const onPlanGenerated = actions.handleFlightPlanGenerated;
	let routeDocuments = $derived(cragEditorState.routeDocuments);
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';
	import CragFlightPlanPanel from './CragFlightPlanPanel.svelte';
	import CragEditorRouteTable from './CragEditorRouteTable.svelte';

	let {
		map = null,
		selectedObject = $bindable(null)
	} = $props();
	let selectedSector = $derived(selectedObject?.type === 'sector' ? (cragEditorState.crag.sectors || []).find((sector) => sector.id === selectedObject.id) : null);
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

	function updateSelectedSectorId(sector, value) {
		cragEditorState.updateSector(sector.id, 'id', value);
		selectedObject = value ? { type: 'sector', id: value } : null;
	}

	function formatGeometryCenter(geometry) {
		const center = getGeometryCenter(geometry);
		return center ? `${center[1].toFixed(5)}, ${center[0].toFixed(5)}` : '';
	}

	function selectSector(sector) {
		selectedObject = { type: 'sector', id: sector.id };
		onFocusSector(sector);
	}

	function updateWallAzimuth(sector, value) {
		if (!Number.isFinite(value)) return;
		cragEditorState.updateSector(sector.id, 'wallAzimuth', Math.max(0, Math.min(359, value)));
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
					<div class="mt-2 border-t border-black/10">
						<CragEditorRouteTable routes={routes} {selectedObject} {onSelectRoute} {onDeleteRoute} />
					</div>
				{/if}
			</div>
		{/each}
	</div>
	{#if selectedSector}{@const sector = selectedSector}
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
			<div class="space-y-0.5"><label for={'sector-name-' + sector.id} class="text-ui-label block">Name</label><input id={'sector-name-' + sector.id} type="text"
	                                                                               value={sector.name}
	                                                                               oninput={(event) => cragEditorState.updateSector(sector.id, 'name', event.currentTarget.value)}
				                                                                               class="input-studio w-full"
				                                                                               placeholder="Sector name" />
				</div>
			<div class="space-y-0.5"><label for={'sector-id-' + sector.id} class="text-ui-label block">ID</label><input id={'sector-id-' + sector.id} type="text" value={sector.id}
				                                                                             oninput={(e) => updateSelectedSectorId(sector, e.currentTarget.value)}
				                                                                             class="input-studio w-full font-mono"
				                                                                             placeholder="sector-id" /></div>
			</div>
			<div class="space-y-0.5">
				<label for="sector-wall-azimuth" class="text-ui-label block">Wall compass direction</label>
				<div class="relative">
					<input
						id="sector-wall-azimuth"
						type="number"
						min="0"
						max="359"
						step="1"
						value={sector.wallAzimuth ?? 0}
						oninput={(event) => updateWallAzimuth(sector, event.currentTarget.valueAsNumber)}
						class="input-studio w-full pr-8!"
					/>
					<span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-micro-data">°</span>
				</div>
			</div>
			<div class="space-y-0.5"><p class="text-ui-label block">Geometry</p>
				<div class="grid grid-cols-2 gap-1 bg-black/5 rounded-sm p-0.5 border border-black/10">
					{#each ['Point', 'Polygon'] as type}
						<button
							class="py-1 rounded-sm text-ui-label transition-none {sector.geometry?.type === type ? 'bg-white shadow-sm text-creator-blue' : 'text-warm-gray-500 hover:bg-black/5'}"
							onclick={() => onSetSectorGeometryType(sector.id, type)}>{type}</button>
					{/each}
				</div>
			</div>
			<div class="grid grid-cols-2 gap-2">
			<div class="space-y-0.5"><label for={'sector-security-' + sector.id} class="text-ui-label block">Security</label><select id={'sector-security-' + sector.id} value={sector.security} onchange={(event) => cragEditorState.updateSector(sector.id, 'security', event.currentTarget.value)}
				                                                                                    class="input-studio w-full appearance-none">
					<option value="">Crag default</option>
					{#each securityOptions as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select></div>
			<div class="space-y-0.5"><label for={'sector-rock-type-' + sector.id} class="text-ui-label block">Rock Type</label><select id={'sector-rock-type-' + sector.id}
					value={sector.rock_type} onchange={(event) => cragEditorState.updateSector(sector.id, 'rock_type', event.currentTarget.value)} class="input-studio w-full appearance-none">
					<option value="">Crag default</option>
					{#each rockTypes as opt}
						<option value={opt}>{opt}</option>
					{/each}
				</select></div>
			</div>
			<div class="space-y-0.5"><p class="text-ui-label block">Sector Type</p>
				<TagSelector selectedTags={sector.type} availableTags={cragTypes} onChange={(value) => cragEditorState.updateSector(sector.id, 'type', value)} />
			</div>
			<div class="space-y-0.5"><p class="text-ui-label block">Tags</p>
				<TagSelector selectedTags={sector.tags} availableTags={availableTags} onChange={(value) => cragEditorState.updateSector(sector.id, 'tags', value)} />
			</div>
			<div class="space-y-0.5 pt-2 border-t border-black/15"><label for={'sector-description-de-' + sector.id} class="text-ui-label block">Description (DE)</label><textarea id={'sector-description-de-' + sector.id}
				value={sector.description_de} oninput={(event) => cragEditorState.updateSector(sector.id, 'description_de', event.currentTarget.value)} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label for={'sector-description-en-' + sector.id} class="text-ui-label block">Description (EN)</label><textarea id={'sector-description-en-' + sector.id}
				value={sector.description_en} oninput={(event) => cragEditorState.updateSector(sector.id, 'description_en', event.currentTarget.value)} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label for={'sector-approach-de-' + sector.id} class="text-ui-label block">Approach (DE)</label><textarea id={'sector-approach-de-' + sector.id}
				value={sector.approach_de} oninput={(event) => cragEditorState.updateSector(sector.id, 'approach_de', event.currentTarget.value)} rows="2" class="input-studio w-full resize-none"></textarea></div>
			<div class="space-y-0.5"><label for={'sector-approach-en-' + sector.id} class="text-ui-label block">Approach (EN)</label><textarea id={'sector-approach-en-' + sector.id}
				value={sector.approach_en} oninput={(event) => cragEditorState.updateSector(sector.id, 'approach_en', event.currentTarget.value)} rows="2" class="input-studio w-full resize-none"></textarea></div>
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
