<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { _ } from 'svelte-i18n';
	import { availableRouteTags, calculateRouteLength, convertRouteType } from '$lib/assets/js/topo-utils.js';
	import GradeSelector from './GradeSelector.svelte';
	import { snapToBiggestHeight } from '$lib/assets/js/resize.js';
	import {
		addGpxAsset,
		createVariant,
		getGpxAssets,
		removeGpxAsset,
		routeLineStyles
	} from './topo-properties-utils.js';
	import RouteLength from '$lib/components/editor/topo-properties/RouteLength.svelte';
	import BoltCount from '$lib/components/editor/topo-properties/BoltCount.svelte';

	let {
		routes = [],
		drawingTarget = $bindable(null),
		activeTool = $bindable('route'),
		mobile = false,
		onGpxUpload = null
	} = $props();

	function selectRoute(route) {
		if (userState.ui.selectedRouteId === route.id) {
			userState.ui.selectedRouteId = null;
			userState.ui.selectedGpxIndex = null;
			drawingTarget = null;
			return;
		}

		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedGpxIndex = null;
		userState.ui.selectedFixpointId = null;
		drawingTarget = route.type !== 'multi-pitch' && !isTrackOnlyRoute(route) ? { type: 'route', id: route.id } : null;
		if (mobile) snapToBiggestHeight();
	}

	function selectGpxAsset(route, index) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedGpxIndex = index;
		userState.ui.selectedFixpointId = null;
		drawingTarget = null;
		if (mobile) snapToBiggestHeight();
	}

	function deleteRoute(route) {
		const index = userState.topo.routes.indexOf(route);
		if (index === -1) return;

		userState.topo.routes.splice(index, 1);
		if (userState.ui.selectedRouteId === route.id) {
			userState.ui.selectedRouteId = null;
			userState.ui.selectedGpxIndex = null;
			drawingTarget = null;
		}
	}

	function addPitch(route) {
		if (!route.pitches) route.pitches = [];
		const lastPitch = route.pitches[route.pitches.length - 1];
		if (lastPitch && (lastPitch.points2D?.length || 0) < 2) {
			drawPitch(route, lastPitch);
			return;
		}
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'newPitch', routeId: route.id };
		activeTool = 'multipitch';
	}

	function drawPitch(route, pitch) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'pitch', routeId: route.id, pitchId: pitch.id };
		activeTool = 'multipitch';
	}

	function addVariant(route) {
		if (!route.variants) route.variants = [];
		const variant = createVariant(route);
		route.variants = [...route.variants, variant];
		drawVariant(route, variant);
	}

	function drawVariant(route, variant) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'variant', routeId: route.id, variantId: variant.id };
		activeTool = 'multipitch';
	}

	function removePitch(route, pitch, index) {
		route.pitches.splice(index, 1);
		if (drawingTarget?.pitchId === pitch.id) drawingTarget = null;
	}

	function removeVariant(route, variant, index) {
		route.variants.splice(index, 1);
		route.variants = [...route.variants];
		if (drawingTarget?.variantId === variant.id) drawingTarget = null;
	}

	function toggleRouteFixpoint(route, fixpointId) {
		if (!route.fixPoints) route.fixPoints = [];
		if (route.fixPoints.includes(fixpointId)) {
			route.fixPoints = route.fixPoints.filter((id) => id !== fixpointId);
		} else {
			route.fixPoints.push(fixpointId);
		}
	}

	function isTrackOnlyRoute(route) {
		return route.geometryMode === 'track' || route.type === 'alpine-tour';
	}
</script>

{#if routes.length === 0}
	<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
		<p class="text-body-text text-warm-gray-500 font-medium">{$_('ui.no_routes_yet')}</p>
	</div>
{/if}

{#each routes as route, i (route.id)}
	<div
		id={'route-' + route.id}
		class={mobile
			? `panel p-3 border-2 $
					{userState.ui.selectedRouteId === route.id
						? 'border-creator-blue ring-4 ring-creator-blue/5'
						: 'border-transparent'}`
			: `panel-inner p-2.5 relative overflow-visible transition-none border $
					{userState.ui.selectedRouteId === route.id ? 'border-creator-blue' : 'border-black/10'}`}
	>
		<div
			class={mobile
				? 'flex items-center gap-3 cursor-pointer'
				: 'flex justify-between items-center mb-2 cursor-pointer group'}
			onclick={() => selectRoute(route)}
		>
			<div class={mobile ? 'flex items-center gap-3 min-w-0 flex-1' : 'flex items-center gap-2'}>
				<div
					class={mobile
						? `w-8 h-8 rounded-sm transition-none flex items-center justify-center text-xs font-black transition-colors shadow-sm $
							{userState.ui.selectedRouteId === route.id
								? 'bg-creator-blue text-white'
								: 'bg-warm-gray-100 text-warm-gray-500'}`
						: `w-5 h-5 rounded-sm flex items-center justify-center text-micro-data font-bold shadow-sm transition-none $
							{userState.ui.selectedRouteId === route.id
								? 'bg-creator-blue text-white'
								: 'bg-black/5 text-warm-gray-500'}`}
				>
					{i + 1}
				</div>
				<div class="min-w-0">
					<h3
						class={mobile
							? `font-black text-sm truncate $
								{userState.ui.selectedRouteId === route.id
									? 'text-creator-blue'
									: 'text-near-black'}`
							: `text-body-text font-bold $
								{userState.ui.selectedRouteId === route.id
									? 'text-creator-blue'
									: 'text-near-black'}`}
					>
						{route.name || `${$_('ui.route')} ${i + 1}`}
					</h3>
					{#if mobile}
						<div class="text-[10px] text-warm-gray-400 font-bold uppercase tracking-wider">
							{#if route.grade}{route.grade} ·{/if}
							{#if route.length}{route.length}m ·{/if}{$_(`types.${route.type}`)}
						</div>
					{/if}
				</div>
			</div>

			<button
				class={mobile
					? 'w-9 h-9 flex items-center justify-center rounded-sm text-warm-gray-200 hover:text-red-500 hover:bg-red-50 transition-none'
					: 'text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50'}
				onclick={(event) => {
					event.stopPropagation();
					deleteRoute(route);
				}}
				title={$_('ui.delete_route')}
				aria-label={$_('ui.delete_route')}
			>
				<i class={mobile ? 'fa-solid fa-trash-can text-sm' : 'fa-solid fa-trash-can text-[10px]'}></i>
			</button>
		</div>

		{#if !mobile || userState.ui.selectedRouteId === route.id}
			<div class={mobile ? 'mt-3 space-y-3 border-t border-black/10 pt-3' : 'space-y-2'}>
				<div class={mobile ? 'grid grid-cols-[1fr_6.5rem] gap-2' : 'flex gap-1.5'}>
					<div class={mobile ? 'space-y-1' : 'flex-1 space-y-0.5'}>
						<label class="text-ui-label block">{$_('ui.name')}</label>
						<input type="text" bind:value={route.name} class="input-studio w-full" />
					</div>
					<div class={mobile ? 'space-y-1' : 'w-1/3 space-y-0.5'}>
						<label class="text-ui-label block">{$_('ui.type')}</label>
						<select
							value={Array.isArray(route.type) ? route.type[0] : route.type}
							onchange={(event) => convertRouteType(route, event.currentTarget.value)}
							class="input-studio w-full appearance-none"
						>
							<option value="sports-climbing">SC</option>
							<option value="bouldering">B</option>
							<option value="trad">T</option>
							<option value="multi-pitch">MP</option>
							<option value="alpine-tour">HT</option>
							<option value="via-ferrata">KS</option>
						</select>
					</div>
				</div>

				<div class={mobile ? 'grid grid-cols-2 gap-2' : 'space-y-0.5'}>
					{#if !isTrackOnlyRoute(route)}
						<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
							<label class="text-ui-label block">Line style</label>
							<select
								value={route.lineStyle || 'red'}
								onchange={(event) => (route.lineStyle = event.currentTarget.value)}
								class="input-studio w-full appearance-none"
							>
								{#each routeLineStyles as style}
									<option value={style.id}>{style.label}</option>
								{/each}
							</select>
						</div>
					{/if}

					{#if route.type !== 'multi-pitch'}
						<GradeSelector route="route" bind:grade={route.grade} bind:scale={route._gradeScale} />
					{/if}
				</div>

				<div class={mobile ? 'space-y-1' : 'space-y-1'}>
					<div class="flex items-center justify-between gap-2">
						<label class="text-ui-label block">GPX Tracks</label>
						<div class="flex items-center gap-1">
							{#if onGpxUpload}
								<label
									class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none cursor-pointer">
									Import
									<input type="file" accept=".gpx,application/gpx+xml" class="hidden"
									       onchange={(event) => onGpxUpload(route, event)} />
								</label>
							{/if}
							<button
								class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
								onclick={() => {
									addGpxAsset(route);
									selectGpxAsset(route, (route.assets?.gpx || []).length - 1);
								}}
							>
								+ Add
							</button>
						</div>
					</div>
					{#if getGpxAssets(route).length === 0}
						<p class="text-micro-data text-warm-gray-400">No GPX tracks attached.</p>
					{/if}
					<div class="space-y-1">
						{#each route.assets?.gpx || [] as gpx, gpxIndex}
							<div
								class={`grid grid-cols-12 gap-1 rounded-sm border p-1 cursor-pointer ${userState.ui.selectedRouteId === route.id && userState.ui.selectedGpxIndex === gpxIndex ? 'border-creator-blue bg-creator-blue/5' : 'border-black/10 bg-white'}`}
								onclick={() => selectGpxAsset(route, gpxIndex)}
							>
								<select bind:value={gpx.role}
								        class="col-span-4 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none">
									<option value="approach">Approach</option>
									<option value="main">Main</option>
									<option value="descent">Descent</option>
									<option value="variant">Variant</option>
								</select>
								<input bind:value={gpx.label}
								       class="col-span-7 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
								       placeholder="Label" />
								<button
									onclick={(event) => { event.stopPropagation(); removeGpxAsset(route, gpxIndex); if (userState.ui.selectedRouteId === route.id && userState.ui.selectedGpxIndex === gpxIndex) userState.ui.selectedGpxIndex = null; }}
									class="col-span-1 text-warm-gray-300 hover:text-rose-600 transition-none">
									<i class="fa-solid fa-xmark text-[10px]"></i>
								</button>
							</div>
						{/each}
					</div>
				</div>


				{#if route.type !== 'multi-pitch'}
					<div class="grid grid-cols-2 gap-2">
						<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
							<RouteLength bind:length={route.length} route={route} toposcale={userState.topo.scale}></RouteLength>
						</div>
						{#if route.type === 'sports-climbing'}
							<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
								<BoltCount bind:length={route.boltAmount} route={route} toposcale={userState.topo.fixPoints} />
							</div>
						{/if}
					</div>
				{:else}
					<div class="rounded-sm border border-black/10 bg-warm-white p-2 space-y-2">
						<div class="flex items-center justify-between gap-2">
							<label class="text-ui-label block">{$_('ui.pitches')}</label>
							<div class="flex items-center gap-1">
								<button
									class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
									onclick={() => addPitch(route)}
								>
									{$_('ui.add_pitch')}
								</button>
							</div>
						</div>

						{#each route.pitches || [] as pitch, idx}
							<div class="gap-1 rounded-sm border border-black/10 bg-white p-1">
								<div class="flex items-center justify-between w-full">
									<span>{ `${$_('ui.pitch')} ${idx + 1}`}</span>

									<div class="flex gap-2">
										<button
											class="text-creator-blue"
											onclick={() => drawPitch(route, pitch)}
											title={$_('ui.draw_pitch')}
											aria-label={$_('ui.draw_pitch')}
										>
											<i class="fa-solid fa-pencil text-[9px]"></i>
										</button>
										<button
											class="text-rose-500"
											onclick={() => removePitch(route, pitch, idx)}
											title={$_('ui.delete_pitch')}
											aria-label={$_('ui.delete_pitch')}
										>
											<i class="fa-solid fa-trash-can text-[9px]"></i>
										</button>
									</div>
								</div>
								<GradeSelector route="route" bind:grade={pitch.grade} bind:scale={pitch._gradeScale} mobile="false" />
								<div class="grid grid-cols-2 gap-2">
									<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
										<RouteLength bind:length={route.length} route={route}
										             toposcale={userState.topo.scale}></RouteLength>
									</div>
									<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
										<BoltCount bind:length={route.boltAmount} route={route} toposcale={userState.topo.fixPoints} />
									</div>
								</div>
								<select
									value={pitch.lineStyle || ''}
									onchange={(event) => (pitch.lineStyle = event.currentTarget.value)}
									class="col-span-12 rounded-sm border border-black/15 bg-white px-1 py-1 text-micro-data outline-none"
								>
									<option value="">Use route line style</option>
									{#each routeLineStyles as style}
										<option value={style.id}>{style.label}</option>
									{/each}
								</select>
							</div>
						{/each}

						<div class="border-t border-black/10 pt-2 space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-ui-label block">{$_('ui.variants')}</label>
								<button
									class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
									onclick={() => addVariant(route)}
								>
									{$_('ui.add_variant')}
								</button>
							</div>
							{#each route.variants || [] as variant, idx}
								<div class="gap-1 rounded-sm border border-black/10 bg-white p-1 items-center">
									<div class="flex items-center justify-between w-full">
										<input
											bind:value={variant.name}
											placeholder={$_('ui.variant_name_placeholder')}
											class="col-span-5 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
										/>
										<div class="flex gap-2">
											<button
												class="col-span-1 text-creator-blue flex justify-center"
												onclick={() => drawVariant(route, variant)}
												title={$_('ui.draw_variant')}
												aria-label={$_('ui.draw_variant')}
											>
												<i class="fa-solid fa-pencil text-[9px]"></i>
											</button>
											<button
												class="col-span-1 text-rose-500 flex justify-center"
												onclick={() => removeVariant(route, variant, idx)}
												title={$_('ui.delete_variant')}
												aria-label={$_('ui.delete_variant')}
											>
												<i class="fa-solid fa-trash-can text-[9px]"></i>
											</button>
										</div>
									</div>
									<div class="col-span-5">
										<GradeSelector route="route" bind:grade={variant.grade}
										               bind:scale={variant._gradeScale}></GradeSelector>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
											<RouteLength bind:length={variant.length} route={variant}
											             toposcale={userState.topo.scale}></RouteLength>
										</div>
										<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
											<BoltCount bind:length={variant.boltAmount} route={variant}
											           toposcale={userState.topo.fixPoints} />
										</div>
									</div>
									<select
										value={variant.lineStyle || 'variant'}
										onchange={(event) => (variant.lineStyle = event.currentTarget.value)}
										class="col-span-7 rounded-sm border border-black/15 bg-white px-1 py-1 text-micro-data outline-none"
									>
										{#each routeLineStyles as style}
											<option value={style.id}>{style.label}</option>
										{/each}
									</select>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
					<label class="text-ui-label block">{$_('ui.description')}</label>
					<textarea
						bind:value={route.description}
						rows={mobile ? 2 : 1}
						class="input-studio w-full resize-none"
					></textarea>
				</div>

				<div class="flex items-center justify-between gap-2 pt-1 border-t border-black/10">
					<div class="flex-1">
						<TagSelector bind:selectedTags={route.tags} availableTags={availableRouteTags} small={true} />
					</div>
					{#if !mobile && userState.topo.fixPoints.length > 0}
						<details class="group/fp flex-none relative">
							<summary
								class="list-none flex items-center justify-center w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 cursor-pointer hover:bg-creator-blue hover:text-white transition-none shadow-sm"
							>
								<i class="fa-solid fa-hashtag text-[10px]"></i>
							</summary>
							<div
								class="absolute bottom-7 right-0 z-20 bg-white shadow-modal rounded-sm p-2 border border-black/15 min-w-[140px]"
							>
								<p class="text-ui-label mb-1.5 border-b border-black/10 pb-1">
									{$_('ui.assign_fixpoints')}
								</p>
								<div class="grid grid-cols-5 gap-1">
									{#each userState.topo.fixPoints as fixpoint, idx}
										<button
											class={'w-6 h-6 flex items-center justify-center rounded-sm text-micro-data font-bold transition-none ' +
												(route.fixPoints?.includes(fixpoint.id)
													? 'bg-creator-blue text-white shadow-sm'
													: 'bg-black/5 text-warm-gray-500 hover:bg-black/10')}
											onclick={(event) => {
												event.stopPropagation();
												toggleRouteFixpoint(route, fixpoint.id);
											}}>{idx + 1}</button
										>
									{/each}
								</div>
							</div>
						</details>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/each}