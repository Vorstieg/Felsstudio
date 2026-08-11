<script>
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';

	const editorState = getTopo2DEditorState();
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
	} from '../topo-properties-utils.js';
	import { _ } from 'svelte-i18n';

	let {
		route = $bindable(null),
		mobile = false,
		onPathSelect = null
	} = $props();

	function hasRouteType(route, type) {
		return Array.isArray(route.type) ? route.type.includes(type) : route.type === type;
	}

	function updateRoute(changes) {
		editorState.updateRoute(route.id, changes);
	}

	function updateRouteType(value) {
		editorState.commit('Change route type', () => {
			convertRouteType(route, value);
			return true;
		});
	}

	function selectPathAsset(route, index) {
		editorState.selectPath('path', route.id, index);
		editorState.ui.drawingTarget = null;
		onPathSelect?.(route, index);
	}

	function pathRefs() {
		return route?.pathRefs || [];
	}

	function addPitch(route) {
		if (!route.pitches) editorState.updateRoute(route.id, { pitches: [] });
		const lastPitch = route.pitches.at(-1);
		if (lastPitch && (lastPitch.points2D?.length || 0) < 2) {
			drawPitch(route, lastPitch);
			return;
		}

		editorState.selectObject('route', route.id);
		editorState.ui.drawingTarget = { type: 'newPitch', routeId: route.id };
		editorState.ui.activeTool = 'multipitch';
		if (mobile) snapToSmallestHeight?.();
	}

	function drawPitch(route, pitch) {
		editorState.selectObject('route', route.id);
		editorState.ui.drawingTarget = { type: 'pitch', routeId: route.id, pitchId: pitch.id };
		editorState.ui.activeTool = 'multipitch';
		if (mobile) snapToSmallestHeight?.();
	}

	function addVariant(route) {
		const variant = createVariant(route);
		editorState.commit('Add route variant', () => {
			route.variants = [...(route.variants || []), variant];
			return true;
		});
		drawVariant(route, variant);
	}

	function drawVariant(route, variant) {
		editorState.selectObject('route', route.id);
		editorState.ui.drawingTarget = { type: 'variant', routeId: route.id, variantId: variant.id };
		editorState.ui.activeTool = 'multipitch';
		if (mobile) snapToSmallestHeight?.();
	}

	function removePitch(route, pitch) {
		editorState.removePitch(route.id, pitch.id);
		if (editorState.ui.drawingTarget?.pitchId === pitch.id) editorState.ui.drawingTarget = null;
	}

	function removeVariant(route, variant) {
		editorState.removeVariant(route.id, variant.id);
		if (editorState.ui.drawingTarget?.variantId === variant.id) editorState.ui.drawingTarget = null;
	}

	function toggleRouteFixpoint(route, fixpointId) {
		const fixPoints = route.fixPoints || [];
		const nextFixPoints = fixPoints.includes(fixpointId)
			? fixPoints.filter((id) => id !== fixpointId)
			: [...fixPoints, fixpointId];
		editorState.updateRoute(route.id, { fixPoints: nextFixPoints });
	}
</script>

<div class={mobile ? 'mt-3 space-y-3 border-t border-black/10 pt-3' : 'space-y-2'}>
	<div class={mobile ? 'grid grid-cols-[1fr_6.5rem] gap-2' : 'flex gap-1.5'}>
		<div class={mobile ? 'space-y-1' : 'flex-1 space-y-0.5'}>
			<label for={'route-name-' + route.id} class="text-ui-label block">{$_('ui.name')}</label>
			<input
				id={'route-name-' + route.id}
				type="text"
				value={route.name || ''}
				oninput={(event) => updateRoute({ name: event.currentTarget.value })}
				class="input-studio w-full"
			/>
		</div>
		<div class={mobile ? 'space-y-1' : 'w-1/3 space-y-0.5'}>
			<label for={'route-type-' + route.id} class="text-ui-label block">{$_('ui.type')}</label>
			<select
				id={'route-type-' + route.id}
				value={Array.isArray(route.type) ? route.type[0] : route.type}
				onchange={(event) => updateRouteType(event.currentTarget.value)}
				class="input-studio w-full appearance-none"
			>
				{#each cragTypes as cragType}
					<option value={cragType}>{$_(`types.${cragType}`)}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if hasRouteType(route, 'multi-pitch')}
		<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
			<label for={'route-line-style-' + route.id} class="text-ui-label block">Line style</label>
			<select
				id={'route-line-style-' + route.id}
				value={route.lineStyle || 'red'}
				onchange={(event) => updateRoute({ lineStyle: event.currentTarget.value })}
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
			onFieldChange={(field, value) => updateRoute({ [field]: value })}
		/>
	{/if}

	<div class='space-y-1'>
		<div class="flex items-center justify-between gap-2">
			<p class="text-ui-label block">Paths</p>
			<div class="flex items-center gap-1">
				<button
					class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
					onclick={() => {
						const pathId = addPathAsset(route, editorState.topo);
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
					class={`grid grid-cols-12 gap-1 rounded-sm border p-1 cursor-pointer ${String(editorState.ui.selectedRouteId) === String(route.id) && String(editorState.ui.selectedPathId) === String(pathAsset.pathId) ? 'border-creator-blue bg-creator-blue/5' : 'border-black/10 bg-white'}`}
					onclick={() => selectPathAsset(route, pathAsset.pathId)}
					role="button"
					tabindex="0"
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							selectPathAsset(route, pathAsset.pathId);
						}
					}}
				>
					<select
						bind:value={pathAsset.role}
						class="col-span-4 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
					>
						<option value="approach">Approach</option>
						<option value="main">Main</option>
						<option value="descent">Descent</option>
						<option value="variant">Variant</option>
					</select>
					<input
						bind:value={pathAsset.label}
						class="col-span-7 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
						placeholder="Label"
					/>
					<button
						aria-label="Remove path"
						onclick={(event) => {
							event.stopPropagation();
							removePathAsset(route, pathAsset.pathId, editorState.topo);
							if (
								String(editorState.ui.selectedRouteId) === String(route.id) &&
								String(editorState.ui.selectedPathId) === String(pathAsset.pathId)
							)
								editorState.ui.selectedPathId = null;
						}}
						class="col-span-1 text-warm-gray-300 hover:text-rose-600 transition-none"
					>
						<i class="fa-solid fa-xmark text-[10px]"></i>
					</button>
				</div>
			{/each}
		</div>
	</div>

	{#if hasRouteType(route, 'multi-pitch')}
		<div class="rounded-sm border border-black/10 bg-warm-white p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<p class="text-ui-label block">{$_('ui.pitches')}</p>
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
					onRemove={(pitch) => removePitch(route, pitch)}
				/>
			{/each}

			<div class="border-t border-black/10 pt-2 space-y-2">
				<div class="flex items-center justify-between">
					<p class="text-ui-label block">{$_('ui.variants')}</p>
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
						onRemove={(variant) => removeVariant(route, variant)}
					/>
				{/each}
			</div>
		</div>
	{/if}

	<div class={mobile ? 'space-y-1' : 'space-y-0.5'}>
		<label for={'route-description-' + route.id} class="text-ui-label block">{$_('ui.description')}</label>
		<textarea
			id={'route-description-' + route.id}
			value={route.description || ''}
			oninput={(event) => updateRoute({ description: event.currentTarget.value })}
			rows={mobile ? 2 : 1}
			class="input-studio w-full resize-none"
		></textarea>
	</div>

	<div class="flex items-center justify-between gap-2 pt-1 border-t border-black/10">
		<div class="flex-1">
			<TagSelector
				selectedTags={route.tags || []}
				onChange={(value) => updateRoute({ tags: value })}
				availableTags={availableRouteTags}
				small={true}
			/>
		</div>
		{#if !mobile && editorState.topo.fixPoints.length > 0}
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
						{#each editorState.topo.fixPoints as fixpoint, idx}
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
