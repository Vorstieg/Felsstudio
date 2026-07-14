<script>
	import { _ } from 'svelte-i18n';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';
	import { fileUrl } from '$lib/api/felslager.js';
	import CragHierarchyPlacement from './CragHierarchyPlacement.svelte';

	let {
		showTabs = true,
		activeTab = $bindable('info'),
		detectedAssets = [],
		editingTrackIndex = null,
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		commonEquipment = [],
		selectedSectorId = $bindable(null),
		routeDocuments = [],
		selectedRouteKey = null,
		saveStatus = 'idle',
		onAddEquipmentItem = () => {},
		onRemoveEquipmentItem = () => {},
		onAddCragImages = () => {},
		onRemoveCragImage = () => {},
		onAddSector = () => {},
		onDuplicateSector = () => {},
		onRemoveSector = () => {},
		onMoveSector = () => {},
		onFocusSector = () => {},
		onSetSectorGeometryType = () => {},
		onSetHoverHighlight = () => {},
		onClearDetectedAssets = () => {},
		onAddDetectedAsset = () => {},
		onRemoveTransit = () => {},
		onRemoveParking = () => {},
		onEditTrack = () => {},
		onRemoveTrack = () => {},
		onFinalizeTrack = () => {},
		onCancelTrackEdit = () => {}
		,
		onAddParentRoute = () => {},
		onAddSectorRoute = () => {},
		onSelectRoute = () => {},
		onUpdateRouteName = () => {},
		onUpdateRoute = () => {},
		onAddRoutePath = () => {},
		onEditRoutePath = () => {},
		onUpdateRoutePath = () => {},
		onRemoveRoutePath = () => {},
		onDeleteRoute = () => {}
	} = $props();

	let selectedSector = $derived(
		(cragEditorState.crag.sectors || []).find((sector) => sector.id === selectedSectorId)
	);
	let pendingCragImageCount = $derived(
		(cragEditorState.crag.assets?.images || []).filter((image) => image?._file).length
	);
	let parentRoutes = $derived(
		routeDocuments.flatMap((document) =>
			document.sectorId ? [] : (document.data?.routes || []).map((route) => ({ document, route }))
		)
	);
	let collapsedRoutePanels = $state({});

	function sectorRoutes(sectorId) {
		return routeDocuments.flatMap((document) =>
			document.sectorId !== sectorId
				? []
				: (document.data?.routes || []).map((route) => ({ document, route }))
		);
	}

	function routeKey(document, route) {
		return `${document.path}:${route.id}`;
	}

	function routePanelIsCollapsed(panelId) {
		return collapsedRoutePanels[panelId] !== false;
	}

	function toggleRoutePanel(panelId) {
		collapsedRoutePanels[panelId] = !routePanelIsCollapsed(panelId);
	}

	function selectedSectorRoute(sectorId) {
		return sectorRoutes(sectorId).find(
			({ document, route }) => selectedRouteKey === routeKey(document, route)
		);
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
		selectedSectorId = value;
	}

	function ensureCragAssets() {
		if (!cragEditorState.crag.assets) cragEditorState.crag.assets = { images: [] };
		if (!cragEditorState.crag.assets.images) cragEditorState.crag.assets.images = [];
	}

	function handleCragImageInput(event) {
		onAddCragImages(Array.from(event.currentTarget.files || []));
		event.currentTarget.value = '';
	}

	function getImageSrc(image) {
		const src = image?.previewUrl || image?.path;
		if (!src) return '';
		if (/^(blob:|data:|https?:\/\/)/i.test(src)) return src;
		return fileUrl(src);
	}

	function getImageStatus(image) {
		if (!image?._file) return { icon: 'fa-cloud-check', label: 'Saved', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
		if (saveStatus === 'saving') return { icon: 'fa-spinner fa-spin', label: 'Uploading', classes: 'bg-creator-blue/10 text-creator-blue border-creator-blue/20' };
		return { icon: 'fa-clock', label: 'Ready to save', classes: 'bg-amber-50 text-amber-700 border-amber-200' };
	}

	function formatGeometryCenter(geometry) {
		const center = getGeometryCenter(geometry);
		return center ? `${center[1].toFixed(5)}, ${center[0].toFixed(5)}` : '';
	}
</script>

{#if showTabs}
<div class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 flex-shrink-0">
	<button
		class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'info' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
		onclick={() => activeTab = 'info'}><i class="fa-solid fa-circle-info mr-1.5"></i> Metadata
	</button>
	<button
		class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'registry' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
		onclick={() => activeTab = 'registry'}><i class="fa-solid fa-layer-group mr-1.5"></i> Registry <span
		class="ml-1 text-micro-data {activeTab === 'registry' ? 'text-warm-gray-400' : 'text-warm-gray-400'}">{cragEditorState.transit.length + cragEditorState.parking.length + cragEditorState.tracks.length}</span>
	</button>
	<button
		class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'sectors' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
		onclick={() => activeTab = 'sectors'}><i class="fa-solid fa-table-cells-large mr-1.5"></i> Sectors <span
		class="ml-1 text-micro-data text-warm-gray-400">{cragEditorState.crag.sectors?.length || 0}</span>
	</button>
</div>
{/if}

<div class="overflow-y-auto flex-1 p-3 pt-0 custom-scrollbar bg-transparent">
	{#if activeTab === 'info'}
		<div class="space-y-4">
			<h3 class="text-ui-label text-near-black flex items-center gap-2">
				<div class="w-1.5 h-1.5 rounded-sm bg-creator-blue"></div>
				Base Information
			</h3>
			<div class="space-y-3">
				<div class="space-y-0.5"><label class="text-ui-label block">Crag Name</label><input type="text"
																																														bind:value={cragEditorState.crag.name}
																																														class="input-studio w-full"
																																														placeholder="e.g. Efeugrat" />
				</div>
				<CragHierarchyPlacement />

				<div class="grid grid-cols-2 gap-2">
					<div class="space-y-0.5"><label class="text-ui-label block">Security</label><select
						bind:value={cragEditorState.crag.security} class="input-studio w-full appearance-none">
						<option value="">Select...</option>
						{#each securityOptions as opt}
							<option value={opt}>{opt}</option>
						{/each}
					</select></div>
					<div class="space-y-0.5"><label class="text-ui-label block">Rock Type</label><select
						bind:value={cragEditorState.crag.rock_type} class="input-studio w-full appearance-none">
						<option value="">Select...</option>
						{#each rockTypes as opt}
							<option value={opt}>{opt}</option>
						{/each}
					</select></div>
				</div>

				<div class="space-y-0.5"><label class="text-ui-label block">Crag Type</label>
					<div>
						<TagSelector bind:selectedTags={cragEditorState.crag.type} availableTags={cragTypes} />
					</div>
				</div>
				<div class="space-y-0.5"><label class="text-ui-label block">Tags</label>
					<div>
						<TagSelector bind:selectedTags={cragEditorState.crag.tags} availableTags={availableTags} />
					</div>
				</div>

				<div class="space-y-1 pt-2 border-t border-black/15">
					<div class="flex justify-between items-center"><label class="text-ui-label !m-0">Equipment</label>
						<button onclick={onAddEquipmentItem}
										class="text-ui-label text-creator-blue hover:text-creator-blue-active">+ Add
						</button>
					</div>
					<div class="space-y-1">
						{#each cragEditorState.crag.equipment as item, i}
							<div class="flex gap-1 items-center bg-white p-1 rounded-sm border border-black/15 shadow-sm">
								<select bind:value={item.name}
												class="flex-1 bg-transparent px-1 py-1 text-body-text outline-none border-none">
									{#each commonEquipment as name}
										<option value={name}>{name}</option>
									{/each}
								</select>
								<input type="number" bind:value={item.amount}
											 class="w-10 bg-black/5 px-1 py-1 rounded-sm text-body-text outline-none text-center" />
								<button onclick={() => onRemoveEquipmentItem(i)}
												class="text-warm-gray-300 hover:text-rose-600 px-1.5 transition-none"><i
									class="fa-solid fa-trash-can text-[10px]"></i></button>
							</div>
						{/each}
					</div>
				</div>

				<div class="space-y-2 pt-2 border-t border-black/15">
					<div class="flex justify-between items-center">
						<div>
							<label class="text-ui-label !m-0">Pictures</label>
							{#if pendingCragImageCount > 0}
								<p class="text-micro-data text-amber-700 !m-0">
									{pendingCragImageCount} picture{pendingCragImageCount === 1 ? '' : 's'} ready to upload. Press Save to publish.
								</p>
							{/if}
						</div>
						<label class="text-ui-label text-creator-blue hover:text-creator-blue-active cursor-pointer">
							+ Add
							<input type="file" accept="image/*" multiple class="hidden" onchange={handleCragImageInput} />
						</label>
					</div>
					{#if (cragEditorState.crag.assets?.images || []).length === 0}
						<p class="text-micro-data text-warm-gray-400">No pictures added.</p>
					{:else}
						<div class="grid grid-cols-2 gap-2">
							{#each cragEditorState.crag.assets?.images || [] as image, i}
								{@const imageStatus = getImageStatus(image)}
								<div class="relative rounded-sm border border-black/15 bg-white p-1 shadow-sm">
									{#if getImageSrc(image)}
										<img src={getImageSrc(image)} alt={image.name || 'Crag picture'} class="h-20 w-full rounded-sm object-cover" />
									{/if}
									<div class="absolute left-2 top-2 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight shadow-sm {imageStatus.classes}">
										<i class="fa-solid {imageStatus.icon} mr-1"></i>{imageStatus.label}
									</div>
									<p class="mt-1 truncate text-micro-data text-warm-gray-500">{image.name || image.path}</p>
									<button type="button" onclick={() => onRemoveCragImage(i)} class="absolute right-1 top-1 h-5 w-5 rounded-sm bg-white/90 text-warm-gray-400 hover:text-rose-600" title="Remove picture">
										<i class="fa-solid fa-xmark text-[10px]"></i>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="space-y-0.5 pt-2 border-t border-black/15"><label class="text-ui-label block">Description
					(DE)</label><textarea bind:value={cragEditorState.crag.description_de} rows="2"
																class="input-studio w-full resize-none"></textarea></div>
				<div class="space-y-0.5"><label class="text-ui-label block">Description (EN)</label><textarea
					bind:value={cragEditorState.crag.description_en} rows="2"
					class="input-studio w-full resize-none"></textarea></div>
			</div>
		</div>
	{:else if activeTab === 'sectors'}
		<div class="flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-ui-label text-near-black !m-0">Sectors</h3>
					<p class="text-micro-data text-warm-gray-400">Optional wall sections inside this crag</p>
				</div>
				<button onclick={onAddSector}
								class="w-7 h-7 rounded-sm bg-creator-blue text-white flex items-center justify-center hover:bg-creator-blue-active transition-none"
								title="Add sector">
					<i class="fa-solid fa-plus text-[10px]"></i>
				</button>
			</div>

			<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2">
				<div class="mb-2 flex items-center justify-between">
					<div class="text-ui-label text-warm-gray-500">Crag routes</div>
					<button class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-creator-blue hover:bg-creator-blue hover:text-white" onclick={onAddParentRoute}>
						<i class="fa-solid fa-route mr-1"></i>+ Route
					</button>
				</div>
				{#if parentRoutes.length === 0}
					<p class="text-micro-data text-warm-gray-400">No parent routes.</p>
				{:else}
					<table class="w-full text-left text-micro-data">
						<thead class="text-warm-gray-400"><tr><th class="pb-1 font-bold">Route</th><th class="pb-1 font-bold">Type</th><th class="pb-1 font-bold">Paths</th><th></th></tr></thead>
						<tbody>
							{#each parentRoutes.slice(0, routePanelIsCollapsed('crag') ? 3 : parentRoutes.length) as { document, route }}
								<tr class="border-t border-black/10 {selectedRouteKey === routeKey(document, route) ? 'bg-creator-blue/5 text-creator-blue' : ''}">
									<td><button class="w-full py-1.5 text-left font-bold" onclick={() => onSelectRoute(document.path, route.id)}>{route.name || 'Unnamed route'}</button></td>
									<td>{route.type || 'route'}</td><td>{route.assets?.paths?.filter((path) => path.path?.coordinates?.length > 1).length || 0}</td>
									<td><button class="text-warm-gray-300 hover:text-rose-600" title="Delete route" onclick={() => onDeleteRoute(document.path, route.id)}><i class="fa-solid fa-trash-can"></i></button></td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if parentRoutes.length > 3}
						<button
							class="mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-micro-data font-bold text-creator-blue hover:border-creator-blue hover:bg-creator-blue/5"
							onclick={() => toggleRoutePanel('crag')}
						>
							<i class={`fa-solid ${routePanelIsCollapsed('crag') ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
							{routePanelIsCollapsed('crag')
								? `Show ${parentRoutes.length - 3} more route${parentRoutes.length === 4 ? '' : 's'}`
								: 'Show fewer routes'}
						</button>
					{/if}
				{/if}
			</div>

			{#if !cragEditorState.crag.sectors || cragEditorState.crag.sectors.length === 0}
				<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15">
					<i class="fa-solid fa-table-cells-large text-2xl text-warm-gray-300 mb-2 block"></i>
					<p class="text-ui-label text-warm-gray-500">No Sectors</p>
				</div>
			{/if}

			<div class="space-y-1">
				{#each cragEditorState.crag.sectors || [] as sector, i}
					{@const isSelected = selectedSectorId === sector.id}
					{@const routes = sectorRoutes(sector.id)}
					<div
						class="w-full panel-inner p-2 text-left border-black/10 hover:border-creator-blue transition-none cursor-pointer {isSelected ? 'border-creator-blue bg-creator-blue/5' : ''}"
						role="button"
						tabindex="0"
						onclick={() => { selectedSectorId = sector.id; ensureSectorCollections(sector); onFocusSector(sector); }}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectedSectorId = sector.id;
								ensureSectorCollections(sector);
								onFocusSector(sector);
							}
						}}
					>
						<div class="flex items-center justify-between gap-2">
							<div class="min-w-0">
								<div class="text-body-text font-bold truncate">{sector.name || sector.id || 'Unnamed Sector'}</div>
								<div class="text-micro-data text-warm-gray-400 truncate">{sector.id || 'missing-id'}</div>
							</div>
							<div class="flex items-center gap-1">
								<button
									class="h-6 rounded-sm px-1.5 text-[10px] font-bold text-creator-blue hover:bg-creator-blue/10"
									title="Add route to this sector"
									onclick={(e) => { e.stopPropagation(); onAddSectorRoute(sector.id); }}
								><i class="fa-solid fa-route mr-1"></i>+ Route</button>
								<button
									class="w-6 h-6 rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-near-black transition-none"
									title="Move up"
									onclick={(e) => { e.stopPropagation(); onMoveSector(sector.id, -1); }}
									disabled={i === 0}
								><i class="fa-solid fa-arrow-up text-[10px]"></i></button>
								<button
									class="w-6 h-6 rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-near-black transition-none"
									title="Move down"
									onclick={(e) => { e.stopPropagation(); onMoveSector(sector.id, 1); }}
									disabled={i === (cragEditorState.crag.sectors || []).length - 1}
								><i class="fa-solid fa-arrow-down text-[10px]"></i></button>
							</div>
						</div>
						{#if routes.length > 0}
							<table class="mt-2 w-full border-t border-black/10 text-left text-micro-data">
								<thead class="text-warm-gray-400"><tr><th class="py-1 font-bold">Route</th><th class="py-1 font-bold">Type</th><th class="py-1 font-bold">Paths</th><th></th></tr></thead>
								<tbody>
									{#each routes.slice(0, routePanelIsCollapsed(`sector:${sector.id}`) ? 3 : routes.length) as { document, route }}
										<tr class="border-t border-black/10 {selectedRouteKey === routeKey(document, route) ? 'bg-creator-blue/5 text-creator-blue' : ''}">
											<td><button class="w-full py-1 text-left font-bold" onclick={(e) => { e.stopPropagation(); onSelectRoute(document.path, route.id); }}>{route.name || 'Unnamed route'}</button></td>
											<td>{route.type || 'route'}</td><td>{route.assets?.paths?.filter((path) => path.path?.coordinates?.length > 1).length || 0}</td>
											<td><button class="text-warm-gray-300 hover:text-rose-600" title="Delete route" onclick={(e) => { e.stopPropagation(); onDeleteRoute(document.path, route.id); }}><i class="fa-solid fa-trash-can"></i></button></td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if routes.length > 3}
								<button
									class="mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-micro-data font-bold text-creator-blue hover:border-creator-blue hover:bg-creator-blue/5"
									onclick={(e) => { e.stopPropagation(); toggleRoutePanel(`sector:${sector.id}`); }}
								>
									<i class={`fa-solid ${routePanelIsCollapsed(`sector:${sector.id}`) ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
									{routePanelIsCollapsed(`sector:${sector.id}`)
										? `Show ${routes.length - 3} more route${routes.length === 4 ? '' : 's'}`
										: 'Show fewer routes'}
								</button>
							{/if}
						{/if}
					</div>
				{/each}
			</div>

			{#if selectedSector}
				{@const sector = selectedSector}
				{@const _normalizedSector = ensureSectorCollections(sector)}
				<div class="space-y-3 pt-3 border-t border-black/15">
					<div class="flex items-center justify-between">
						<h3 class="text-ui-label text-near-black !m-0">Selected Sector</h3>
						<div class="flex items-center gap-1">
							<button onclick={() => onDuplicateSector(sector.id)}
											class="w-7 h-7 rounded-sm text-warm-gray-400 hover:bg-black/5 hover:text-near-black transition-none"
											title="Duplicate sector">
								<i class="fa-solid fa-copy text-[10px]"></i>
							</button>
							<button onclick={() => onRemoveSector(sector.id)}
											class="w-7 h-7 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none"
											title="Delete sector">
								<i class="fa-solid fa-trash-can text-[10px]"></i>
							</button>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-0.5">
							<label class="text-ui-label block">Name</label>
							<input type="text" bind:value={sector.name} class="input-studio w-full" placeholder="Sector name" />
						</div>
						<div class="space-y-0.5">
							<label class="text-ui-label block">ID</label>
							<input
								type="text"
								value={sector.id}
								oninput={(e) => updateSelectedSectorId(sector, e.currentTarget.value)}
								class="input-studio w-full font-mono"
								placeholder="sector-id"
							/>
						</div>
					</div>

					<div class="space-y-0.5">
						<label class="text-ui-label block">Geometry</label>
						<div class="grid grid-cols-2 gap-1 bg-black/5 rounded-sm p-0.5 border border-black/10">
							{#each ['Point', 'Polygon'] as type}
								<button
									class="py-1 rounded-sm text-ui-label transition-none {sector.geometry?.type === type ? 'bg-white shadow-sm text-creator-blue' : 'text-warm-gray-500 hover:bg-black/5'}"
									onclick={() => onSetSectorGeometryType(sector.id, type)}
								>
									{type}
								</button>
							{/each}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-0.5">
							<label class="text-ui-label block">Security</label>
							<select bind:value={sector.security} class="input-studio w-full appearance-none">
								<option value="">Crag default</option>
								{#each securityOptions as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-0.5">
							<label class="text-ui-label block">Rock Type</label>
							<select bind:value={sector.rock_type} class="input-studio w-full appearance-none">
								<option value="">Crag default</option>
								{#each rockTypes as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="space-y-0.5">
						<label class="text-ui-label block">Sector Type</label>
						<TagSelector bind:selectedTags={sector.type} availableTags={cragTypes} />
					</div>
					<div class="space-y-0.5">
						<label class="text-ui-label block">Tags</label>
						<TagSelector bind:selectedTags={sector.tags} availableTags={availableTags} />
					</div>

					<div class="space-y-0.5 pt-2 border-t border-black/15">
						<label class="text-ui-label block">Description (DE)</label>
						<textarea bind:value={sector.description_de} rows="2" class="input-studio w-full resize-none"></textarea>
					</div>
					<div class="space-y-0.5">
						<label class="text-ui-label block">Description (EN)</label>
						<textarea bind:value={sector.description_en} rows="2" class="input-studio w-full resize-none"></textarea>
					</div>
					<div class="space-y-0.5">
						<label class="text-ui-label block">Approach (DE)</label>
						<textarea bind:value={sector.approach_de} rows="2" class="input-studio w-full resize-none"></textarea>
					</div>
					<div class="space-y-0.5">
						<label class="text-ui-label block">Approach (EN)</label>
						<textarea bind:value={sector.approach_en} rows="2" class="input-studio w-full resize-none"></textarea>
					</div>

					<div class="flex items-center justify-between bg-white rounded-sm border border-black/15 p-2">
						<span class="text-ui-label text-warm-gray-500 !m-0">{sector.geometry?.type === 'Polygon' ? 'Center' : 'Position'}</span>
						{#if formatGeometryCenter(sector.geometry)}
							<span class="font-mono text-micro-data text-creator-blue font-bold">
								{formatGeometryCenter(sector.geometry)}
							</span>
						{:else}
							<span class="text-micro-data text-warm-gray-400">Crag default</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#if detectedAssets.length > 0}
				<div class="bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5 mb-1">
					<div class="flex justify-between items-center"><span
						class="text-ui-label text-creator-blue">{$_('ui.nearby_suggestions')}</span>
						<button class="text-micro-data font-bold text-warm-gray-400 hover:text-near-black"
										onclick={() => { onClearDetectedAssets(); onSetHoverHighlight(null); }}>{$_('ui.dismiss')}</button>
					</div>
					<div class="space-y-1">
						{#each detectedAssets as asset}
							<div
								class="detected-asset-row bg-white rounded-sm p-1.5 shadow-sm border border-black/15 flex items-center justify-between gap-2 group transition-none"
								onmouseenter={() => onSetHoverHighlight(asset)} onmouseleave={() => onSetHoverHighlight(null)}>
								<div class="flex items-center gap-2">
									<div
										class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data">
										{#if asset.type === 'parking'}<i
											class="fa-solid fa-square-parking"></i>{:else if asset.type === 'bus'}<i
											class="fa-solid fa-bus"></i>{:else}<i class="fa-solid fa-train"></i>{/if}
									</div>
									<div class="min-w-0"><p
										class="text-body-text font-bold text-near-black truncate leading-tight w-28">{asset.name}</p>
									</div>
								</div>
								<button
									class="px-2 py-1 bg-near-black text-white rounded-sm text-micro-data font-bold hover:bg-black"
									onclick={() => onAddDetectedAsset(asset)}>Add
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if cragEditorState.transit.length === 0 && cragEditorState.parking.length === 0 && cragEditorState.tracks.length === 0 && detectedAssets.length === 0}
				<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15 mt-2">
					<i class="fa-solid fa-layer-group text-2xl text-warm-gray-300 mb-2 block"></i>
					<p class="text-ui-label text-warm-gray-500">Inventory Empty</p>
				</div>
			{/if}

			{#each cragEditorState.transit as point}
				<div class="panel-inner p-2 flex flex-col gap-2 transition-none border-black/10 hover:border-creator-blue">
					<div class="flex justify-between items-center">
						<div class="flex items-center gap-2">
							<div
								class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
								<i class="fa-solid fa-bus text-[10px]"></i></div>
							<span class="text-ui-label text-near-black !m-0">Transit Point</span></div>
						<button onclick={() => onRemoveTransit(point.id)}
										class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center">
							<i class="fa-solid fa-trash-can text-[10px]"></i></button>
					</div>
					<div class="flex gap-1.5"><select bind:value={point.type} class="input-studio w-16 !px-1 appearance-none">
						<option value="bus">Bus</option>
						<option value="train">Train</option>
					</select><input type="text" bind:value={point.name} class="input-studio flex-1"
													placeholder="Station Name" /></div>
				</div>
			{/each}

			{#each cragEditorState.parking as park}
				<div
					class="panel-inner p-2 flex justify-between items-center transition-none border-black/10 hover:border-creator-blue">
					<div class="flex items-center gap-2">
						<div
							class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 border border-black/10">
							<i class="fa-solid fa-square-parking text-[10px]"></i></div>
						<span class="text-ui-label text-near-black !m-0">Parking Space</span></div>
					<button onclick={() => onRemoveParking(park.id)}
									class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center">
						<i class="fa-solid fa-trash-can text-[10px]"></i></button>
				</div>
			{/each}

			{#each cragEditorState.tracks as track, i}
				<div class="panel-inner p-2 flex flex-col gap-2 transition-none border-black/10 hover:border-creator-blue">
					<div class="flex justify-between items-center">
						<div class="flex items-center gap-2">
							<div
								class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
								<i class="fa-solid fa-route text-[10px]"></i></div>
							<span class="text-ui-label text-near-black !m-0">Approach Track</span></div>
						<div class="flex items-center gap-1">
							<button onclick={() => onEditTrack(i)}
											class="w-6 h-6 rounded-sm text-warm-gray-400 hover:bg-creator-blue/10 hover:text-creator-blue transition-none flex items-center justify-center"
											title="Edit approach track">
								<i class="fa-solid fa-pen text-[10px]"></i></button>
							<button onclick={() => onRemoveTrack(i)}
											class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center"
											title="Delete approach track">
								<i class="fa-solid fa-trash-can text-[10px]"></i></button>
						</div>
					</div>
					<input type="text" bind:value={track.name} class="input-studio w-full" placeholder="Track Name" />
					{#if editingTrackIndex === i}
						<div class="flex items-center gap-1.5">
							<button onclick={onFinalizeTrack}
											class="flex-1 bg-creator-blue text-white rounded-sm py-1 text-micro-data font-bold uppercase tracking-widest">
								Save Track
							</button>
							<button onclick={onCancelTrackEdit}
											class="w-8 bg-black/5 text-warm-gray-500 rounded-sm py-1 text-micro-data font-bold hover:text-near-black"
											title="Cancel track edit">
								<i class="fa-solid fa-xmark text-[10px]"></i>
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.detected-asset-row {
		cursor: pointer;
	}

	.detected-asset-row:hover {
		border-color: #0075de !important;
	}
</style>
