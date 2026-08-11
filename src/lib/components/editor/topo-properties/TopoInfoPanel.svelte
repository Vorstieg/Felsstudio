<script>
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';

	const editorState = getTopo2DEditorState();
	let topo = $derived(editorState.topo);
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import ImageUploader from '$lib/components/editor/ImageUploader.svelte';
	import ClusteringMap from '$lib/components/editor/ClusteringMap.svelte';
	import { _ } from 'svelte-i18n';
	import { availableTopoTags } from '$lib/assets/js/topo-utils.js';
	import TopoJsonEditor from './TopoJsonEditor.svelte';
	import { rockTypes } from '$lib/config.js';

	const wallDirections = [
		{ id: 'N', azimuth: 0 },
		{ id: 'NE', azimuth: 45 },
		{ id: 'E', azimuth: 90 },
		{ id: 'SE', azimuth: 135 },
		{ id: 'S', azimuth: 180 },
		{ id: 'SW', azimuth: 225 },
		{ id: 'W', azimuth: 270 },
		{ id: 'NW', azimuth: 315 }
	];

	let {
		showMapModal = $bindable(false),
		showJsonEditor = false,
		topoJsonText = $bindable(''),
		topoJsonError = '',
		onformatjson,
		onapplyjson,
		mobile = false
	} = $props();

	function updateTopoField(field, value) {
		editorState.updateNestedPath(field, value);
	}

	function wallDirectionForAzimuth(azimuth) {
		const normalized = ((Number(azimuth) % 360) + 360) % 360;
		return wallDirections[Math.round(normalized / 45) % wallDirections.length];
	}

	function updateWallDirection(directionId) {
		const direction = wallDirections.find((item) => item.id === directionId);
		if (direction) updateTopoField('wallAzimuth', direction.azimuth);
	}
</script>

<div class="space-y-3">
	<div class="space-y-2.5">
		{#if showJsonEditor}
			<TopoJsonEditor
				bind:text={topoJsonText}
				error={topoJsonError}
				onformat={onformatjson}
				onapply={onapplyjson}
			/>
		{/if}

		<div class="space-y-0.5">
			<label for="author" class="text-ui-label block">{$_('ui.author')}</label>
			<input
				type="text"
				id="author"
				value={topo.author || ''}
				oninput={(event) => updateTopoField('author', event.currentTarget.value)}
				class="input-studio w-full"
				placeholder={$_('ui.author_placeholder')}
			/>
		</div>

		<div class="space-y-0.5">
			<label for="rock" class="text-ui-label block">{$_('ui.rock_type')}</label>
			<select
				id="rock"
				value={topo.rock || ''}
				onchange={(event) => updateTopoField('rock', event.currentTarget.value)}
				class="input-studio w-full appearance-none"
			>
				{#each rockTypes as rockType}
					<option value={rockType}>{$_(`rock_types.${rockType}`)}</option>
				{/each}
			</select>
		</div>

		{#if topo.editorMode === '3d'}
			<div class="space-y-0.5">
				<p class="text-ui-label block">{$_('ui.location')}</p>
				{#if Object.keys(editorState.clustering.gpsData || {}).length > 0}
					<ClusteringMap />
				{:else}
					<div
						class="flex items-center gap-2 p-1.5 rounded-sm bg-black/5 border border-black/15 shadow-sm"
					>
						<button
							class="bg-near-black text-white hover:bg-black px-2.5 py-1.5 rounded-sm text-ui-label transition-none flex items-center gap-1.5 shadow-sm"
							onclick={() => (showMapModal = true)}
						>
							<i class="fa-solid fa-map-location-dot opacity-60"></i>{$_('ui.open_map')}
						</button>
						<div class="flex-1 min-w-0 pr-1">
							{#if topo.coordinates[0] !== 0}
								<div
									class="text-micro-data font-mono truncate leading-none text-near-black font-bold"
								>
									{topo.coordinates[1].toFixed(5)}
									, {topo.coordinates[0].toFixed(5)}
								</div>
								<div
									class="text-[9px] text-warm-gray-400 font-bold uppercase mt-1 leading-none tracking-tight"
								>
									{wallDirectionForAzimuth(topo.wallAzimuth).id} / {topo.altitude
									? topo.altitude.toFixed(0)
									: 0}m
								</div>
							{:else}
								<div class="text-micro-data text-warm-gray-400 italic">
									{$_('sun.no_geodata')}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if topo.editorMode === '2d'}
			<div class="space-y-0.5">
				<label for="wall-azimuth" class="text-ui-label block">{$_('topo.wall_direction')}</label>
				<select
					id="wall-azimuth"
					value={wallDirectionForAzimuth(topo.wallAzimuth).id}
					onchange={(event) => updateWallDirection(event.currentTarget.value)}
					class="input-studio w-full appearance-none"
				>
					{#each wallDirections as direction}
						<option value={direction.id}>{direction.id} — {$_(`directions.${direction.id}`)}</option>
					{/each}
				</select>
			</div>
		{/if}

		<div class="space-y-0.5">
			<label for="description" class="text-ui-label block">{$_('ui.description')}</label>
			<textarea
				id="description"
				value={topo.description || ''}
				oninput={(event) => updateTopoField('description', event.currentTarget.value)}
				rows="2"
				class="input-studio w-full resize-none"
				placeholder={$_('ui.description_placeholder')}
			></textarea>
		</div>

		<div class="space-y-0.5">
			<p class="text-ui-label block">{$_('ui.tags')}</p>
			<TagSelector
				selectedTags={topo.tags || []}
				onChange={(value) => updateTopoField('tags', value)}
				availableTags={availableTopoTags}
			/>
		</div>

		{#if topo.editorMode === '2d'}
			<div class="pt-2 border-t border-black/15">
				<ImageUploader />
			</div>
		{/if}
	</div>
</div>
