<script>
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	const userState = getTopoEditorSession();
	import { cragTypes } from '$lib/components/editor/crag/crag-editor-options.js';
	import { availableRouteTags, convertRouteType } from '$lib/assets/js/topo-utils.js';
	import { snapToSmallestHeight } from '$lib/assets/js/resize.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import PitchComponent from './PitchComponent.svelte';
	import {
		addPathAsset,
		createVariant,
		removePathAsset,
		routeLineStyles
	} from './topo-properties-utils.js';
	import { _ } from 'svelte-i18n';

	let {
		route = $bindable(null),
		drawingTarget = $bindable(null),
		activeTool = $bindable('route'),
		mobile = false,
		onPathUpload = null,
		onPathSelect = null
	} = $props();

	function hasRouteType(route, type) {
		return Array.isArray(route.type) ? route.type.includes(type) : route.type === type;
	}

	function selectPathAsset(route, index) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedPathId = index;
		userState.ui.selectedFixpointId = null;
		drawingTarget = null;
		onPathSelect?.(route, index);
	}

	function pathRefs() { return route?.pathRefs || []; }

	function addPitch(route) {
		if (!route.pitches) route.pitches = [];
		const lastPitch = route.pitches.at(-1);
		if (lastPitch && (lastPitch.points2D?.length || 0) < 2) {
			drawPitch(route, lastPitch);
			return;
		}

		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'newPitch', routeId: route.id };
		activeTool = 'multipitch';
		if (mobile) snapToSmallestHeight?.();
	}

	function drawPitch(route, pitch) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'pitch', routeId: route.id, pitchId: pitch.id };
		activeTool = 'multipitch';
		if (mobile) snapToSmallestHeight?.();
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
		if (mobile) snapToSmallestHeight?.();
	}

	function removePitch(route, pitch, index) {
		route.pitches.splice(index, 1);
		route.pitches = [...route.pitches];
		if (drawingTarget?.pitchId === pitch.id) drawingTarget = null;
	}

	function removeVariant(route, variant, index) {
		route.variants.splice(index, 1);
		route.variants = [...route.variants];
		if (drawingTarget?.variantId === variant.id) drawingTarget = null;
	}

	function toggleRouteFixpoint(route, fixpointId) {
		const fixPoints = route.fixPoints || [];
		route.fixPoints = fixPoints.includes(fixpointId)
			? fixPoints.filter((id) => id !== fixpointId)
			: [...fixPoints, fixpointId];
	}

</script>

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
				{#each cragTypes as cragType}
					<option value={cragType}>{$_(`types.${cragType}`)}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class={mobile ? 'grid grid-cols-2 gap-2' : 'space-y-0.5'}>
		{#if hasRouteType(route, 'multi-pitch')}
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
		{:else}
			<PitchComponent
				pitch={route}
				{mobile}
				showBoltCount={hasRouteType(route, 'sports-climbing')}
			/>
		{/if}
	</div>

	<div class={mobile ? 'space-y-1' : 'space-y-1'}>
		<div class="flex items-center justify-between gap-2">
			<label class="text-ui-label block">Paths</label>
			<div class="flex items-center gap-1">
				{#if onPathUpload}
					<label
						class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none cursor-pointer">
						Import
						<input type="file" accept=".gpx,application/gpx+xml" class="hidden"
						       onchange={(event) => onPathUpload(route, event)} />
					</label>
				{/if}
				<button
					class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
					onclick={() => {
									const pathId = addPathAsset(route, userState.topo);
									selectPathAsset(route, pathId);
								}}
				>
					+ Add
				</button>
			</div>
		</div>
		{#if pathRefs().length === 0}
			<p class="text-micro-data text-warm-gray-400">No paths attached.</p>
		{/if}
		<div class="space-y-1">
			{#each pathRefs() as pathAsset}
				<div
					class={`grid grid-cols-12 gap-1 rounded-sm border p-1 cursor-pointer ${userState.ui.selectedRouteId === route.id && userState.ui.selectedPathId === pathAsset.pathId ? 'border-creator-blue bg-creator-blue/5' : 'border-black/10 bg-white'}`}
					onclick={() => selectPathAsset(route, pathAsset.pathId)}
				>
					<select bind:value={pathAsset.role}
					        class="col-span-4 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none">
						<option value="approach">Approach</option>
						<option value="main">Main</option>
						<option value="descent">Descent</option>
						<option value="variant">Variant</option>
					</select>
					<input bind:value={pathAsset.label}
					       class="col-span-7 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
					       placeholder="Label" />
					<button
						onclick={(event) => { event.stopPropagation(); removePathAsset(route, pathAsset.pathId, userState.topo); if (userState.ui.selectedRouteId === route.id && userState.ui.selectedPathId === pathAsset.pathId) userState.ui.selectedPathId = null; }}
						class="col-span-1 text-warm-gray-300 hover:text-rose-600 transition-none">
						<i class="fa-solid fa-xmark text-[10px]"></i>
					</button>
				</div>
			{/each}
		</div>
	</div>


	{#if hasRouteType(route, 'multi-pitch')}
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
				<PitchComponent
					{pitch}
					index={idx}
					kind="pitch"
					{mobile}
					inheritLineStyle={true}
					onDraw={(pitch) => drawPitch(route, pitch)}
					onRemove={(pitch, index) => removePitch(route, pitch, index)}
				/>
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
					<PitchComponent
						pitch={variant}
						index={idx}
						kind="variant"
						{mobile}
						defaultLineStyle="variant"
						onDraw={(variant) => drawVariant(route, variant)}
						onRemove={(variant, index) => removeVariant(route, variant, index)}
					/>
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
