<script>
	import { _ } from 'svelte-i18n';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';

	let {
		detectedAssets = [], activeTrackTarget = null, routeDocuments = [], onAddRoutePath = () => {}, onEditRoutePath = () => {}, onDeleteRoutePath = () => {}, onSetHoverHighlight = () => {
		}, onClearDetectedAssets = () => {
		}, onAddDetectedAsset = () => {
		}, onRemoveAccessFeature = () => {
		}, onEditTrack = () => {
		}, onRemoveTrack = () => {
		}, onFinalizeTrack = () => {
		}, onCancelTrackEdit = () => {
		}
	} = $props();
	let accessFeatures = $derived(cragEditorState.access?.features || []);
	let transitFeatures = $derived(accessFeatures.filter((feature) => feature.properties?.kind === 'transit'));
	let parkingFeatures = $derived(accessFeatures.filter((feature) => feature.properties?.kind === 'parking'));
	let hutFeatures = $derived(accessFeatures.filter((feature) => feature.properties?.kind === 'hut'));
	let approachFeatures = $derived(accessFeatures.filter((feature) => feature.properties?.kind === 'approach'));
	function assignedRoutes(document, pathId) {
		return (document.data?.routes || []).filter((route) => (route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId)));
	}
	function editPath(document, feature) {
		const route = assignedRoutes(document, feature.id)[0];
		if (route) onEditRoutePath(document.path, route.id, feature.id);
	}
</script>

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
						class="detected-asset-row bg-white rounded-sm p-1.5 shadow-sm border border-black/15 flex items-center justify-between gap-2"
						onmouseenter={() => onSetHoverHighlight(asset)} onmouseleave={() => onSetHoverHighlight(null)}>
						<div class="flex items-center gap-2">
							<div
								class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data">
								{#if asset.kind === 'parking'}<i class="fa-solid fa-square-parking"></i>{:else if asset.kind === 'hut'}
									<i class="fa-solid fa-house"></i>{:else if asset.mode === 'bus'}<i class="fa-solid fa-bus"></i>{:else}
									<i class="fa-solid fa-train"></i>{/if}
							</div>
							<p class="text-body-text font-bold text-near-black truncate leading-tight w-28">{asset.name}</p></div>
						<button class="px-2 py-1 bg-near-black text-white rounded-sm text-micro-data font-bold hover:bg-black"
						        onclick={() => onAddDetectedAsset(asset)}>Add
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
	{#if accessFeatures.length === 0 && detectedAssets.length === 0}
		<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15 mt-2"><i
			class="fa-solid fa-layer-group text-2xl text-warm-gray-300 mb-2 block"></i>
			<p class="text-ui-label text-warm-gray-500">Inventory Empty</p></div>
	{/if}
	{#each transitFeatures as point}
		<div class="panel-inner p-2 flex flex-col gap-2 border-black/10 hover:border-creator-blue">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
						<i class="fa-solid fa-bus text-[10px]"></i></div>
					<span class="text-ui-label text-near-black !m-0">Transit Point</span></div>
				<button onclick={() => onRemoveAccessFeature(point.id)}
				        class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"><i
					class="fa-solid fa-trash-can text-[10px]"></i></button>
			</div>
			<div class="flex gap-1.5"><select bind:value={point.properties.mode}
			                                  class="input-studio w-16 !px-1 appearance-none">
				<option value="bus">Bus</option>
				<option value="train">Train</option>
			</select><input type="text" bind:value={point.properties.name} class="input-studio flex-1"
			                placeholder="Station Name" /></div>
		</div>
	{/each}
	{#each parkingFeatures as point}
		<div class="panel-inner p-2 flex justify-between items-center border-black/10 hover:border-creator-blue">
			<div class="flex items-center gap-2">
				<div
					class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 border border-black/10">
					<i class="fa-solid fa-square-parking text-[10px]"></i></div>
				<span class="text-ui-label text-near-black !m-0">Parking Space</span></div>
			<button onclick={() => onRemoveAccessFeature(point.id)}
			        class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"><i
				class="fa-solid fa-trash-can text-[10px]"></i></button>
		</div>
	{/each}
	{#each hutFeatures as hut}
		<div class="panel-inner p-2 flex flex-col gap-2 border-black/10 hover:border-creator-blue">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
						<i class="fa-solid fa-house text-[10px]"></i></div>
					<span class="text-ui-label text-near-black !m-0">Mountain Hut</span></div>
				<button onclick={() => onRemoveAccessFeature(hut.id)}
				        class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600"><i
					class="fa-solid fa-trash-can text-[10px]"></i></button>
			</div>
			<input type="text" bind:value={hut.properties.name} class="input-studio w-full" placeholder="Hut Name" /></div>
	{/each}
	{#each approachFeatures as track}
		<div class="panel-inner p-2 flex flex-col gap-2 border-black/10 hover:border-creator-blue">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-2">
					<div
						class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
						<i class="fa-solid fa-route text-[10px]"></i></div>
					<span class="text-ui-label text-near-black !m-0">Approach Track</span></div>
				<div class="flex items-center gap-1">
					<button onclick={() => onEditTrack(track.id)} class="w-6 h-6 text-warm-gray-400" title="Edit approach track">
						<i class="fa-solid fa-pen text-[10px]"></i></button>
					<button onclick={() => onRemoveTrack(track.id)} class="w-6 h-6 text-warm-gray-300 hover:text-rose-600"
					        title="Delete approach track"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
				</div>
			</div>
			<input type="text" bind:value={track.properties.name} class="input-studio w-full" placeholder="Track Name" />
			{#if activeTrackTarget?.kind === 'access' && activeTrackTarget.featureId === track.id}
				<div class="flex items-center gap-1.5">
					<button onclick={onFinalizeTrack}
					        class="flex-1 bg-creator-blue text-white rounded-sm py-1 text-micro-data font-bold uppercase tracking-widest">
						Save Track
					</button>
					<button onclick={onCancelTrackEdit} class="w-8 bg-black/5 text-warm-gray-500 rounded-sm py-1"
					        title="Cancel track edit"><i class="fa-solid fa-xmark text-[10px]"></i></button>
				</div>
			{/if}
		</div>
	{/each}
	<div class="mt-3 space-y-2 border-t border-black/10 pt-3">
		<div class="flex items-center justify-between"><span class="text-ui-label">Topo paths</span><span class="text-micro-data text-warm-gray-500">{routeDocuments.reduce((count, document) => count + (document.data?.paths?.features?.length || 0), 0)}</span></div>
		{#each routeDocuments as document}
			<div class="space-y-1 rounded-sm border border-black/10 bg-white p-2">
				<div class="flex items-center justify-between gap-1"><div class="text-micro-data font-bold text-warm-gray-500">{document.path.split('/').at(-1)}</div>{#if document.data?.routes?.[0]}<button type="button" class="text-micro-data text-creator-blue" onclick={() => onAddRoutePath(document.path, document.data.routes[0].id)}>Draw path</button>{/if}</div>
				{#each document.data?.paths?.features || [] as feature}
					{@const routes = assignedRoutes(document, feature.id)}
					<div class="space-y-1 rounded-sm border border-black/10 p-1">
						<div class="flex items-center justify-between gap-1">
							<input class="input-studio min-w-0 flex-1" value={feature.properties?.name || ''} placeholder="Path name" onchange={(event) => { feature.properties = { ...(feature.properties || {}), name: event.currentTarget.value }; document.dirty = true; }} />
							<span class="text-micro-data text-warm-gray-500">{routes.length} route{routes.length === 1 ? '' : 's'}</span>
						</div>
						<div class="text-micro-data text-warm-gray-500">{#if routes.length > 0}Used by: {routes.map((route) => route.name || route.id).join(', ')}{:else}Unassigned{/if}</div>
						<div class="flex items-center justify-between gap-1 text-micro-data {feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length > 1 ? 'text-emerald-700' : 'text-rose-600'}">
							<span>{feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length > 1 ? 'Valid geometry' : 'Invalid geometry'}</span>
							<div class="flex gap-1">
								<button type="button" class="text-creator-blue" title="Edit path" onclick={() => editPath(document, feature)}>Edit</button>
								<button type="button" class="text-rose-600" title="Delete path" onclick={() => onDeleteRoutePath(document.path, feature.id)}>Delete</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
    .detected-asset-row {
        cursor: pointer;
    }

    .detected-asset-row:hover {
        border-color: #0075de !important;
    }
</style>
