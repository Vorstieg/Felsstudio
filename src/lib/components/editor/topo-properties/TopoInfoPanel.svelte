<script>
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	const userState = getTopoEditorSession();
	const editorState = getTopo2DEditorState();
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import ImageUploader from '$lib/components/editor/ImageUploader.svelte';
	import ClusteringMap from '$lib/components/editor/ClusteringMap.svelte';
	import { _ } from 'svelte-i18n';
	import { availableTopoTags } from '$lib/assets/js/topo-utils.js';
	import TopoJsonEditor from './TopoJsonEditor.svelte';
	import { rockTypes } from '$lib/config.js';

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
		if (editorState) editorState.updateNestedPath(field, value);
		else userState.topo[field] = value;
	}
</script>

{#if mobile}
	<div class="space-y-4 pt-1">
		{#if showJsonEditor}
			<TopoJsonEditor
				id="topo-json-editor-mobile"
				bind:text={topoJsonText}
				error={topoJsonError}
				onformat={onformatjson}
				onapply={onapplyjson}
			/>
		{/if}

		<div class="px-1 pt-2">
			<ImageUploader />
		</div>
	</div>
{:else}
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
					value={userState.topo.author || ''}
					oninput={(event) => updateTopoField('author', event.currentTarget.value)}
					class="input-studio w-full"
					placeholder={$_('ui.author_placeholder')}
				/>
			</div>

			<div class="space-y-0.5">
				<label for="rock" class="text-ui-label block">{$_('ui.rock_type')}</label>
				<select
					id="rock"
					value={userState.topo.rock || ''}
					onchange={(event) => updateTopoField('rock', event.currentTarget.value)}
					class="input-studio w-full appearance-none"
				>
					{#each rockTypes as rockType}
						<option value={rockType}>{$_(`rock_types.${rockType}`)}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-0.5">
					<p class="text-ui-label block">{$_('ui.location')}</p>
				{#if Object.keys(userState.clustering.gpsData || {}).length > 0}
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
							{#if userState.topo.coordinates[0] !== 0}
								<div
									class="text-micro-data font-mono truncate leading-none text-near-black font-bold"
								>
									{userState.topo.coordinates[1].toFixed(5)}
									, {userState.topo.coordinates[0].toFixed(5)}
								</div>
								<div
									class="text-[9px] text-warm-gray-400 font-bold uppercase mt-1 leading-none tracking-tight"
								>
									{userState.topo.wallAzimuth}
									° / {userState.topo.altitude ? userState.topo.altitude.toFixed(0) : 0}m
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

			<div class="space-y-0.5">
				<label for="description" class="text-ui-label block">{$_('ui.description')}</label>
				<textarea
					id="description"
					value={userState.topo.description || ''}
					oninput={(event) => updateTopoField('description', event.currentTarget.value)}
					rows="2"
					class="input-studio w-full resize-none"
					placeholder={$_('ui.description_placeholder')}
				></textarea>
			</div>

			<div class="space-y-0.5">
					<p class="text-ui-label block">{$_('ui.tags')}</p>
				<TagSelector
					selectedTags={userState.topo.tags || []}
					onChange={(value) => updateTopoField('tags', value)}
					availableTags={availableTopoTags}
				/>
			</div>

			{#if userState.topo.editorMode === '2d'}
				<div class="pt-2 border-t border-black/15">
					<ImageUploader />
				</div>
			{/if}
		</div>
	</div>
{/if}
