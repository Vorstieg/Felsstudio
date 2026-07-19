<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import ImageUploader from '$lib/components/editor/ImageUploader.svelte';
	import ClusteringMap from '$lib/components/editor/ClusteringMap.svelte';
	import { _ } from 'svelte-i18n';
	import { availableTopoTags } from '$lib/assets/js/topo-utils.js';
	import { outlineLineStyles } from './topo-properties-utils.js';
	import TopoJsonEditor from './TopoJsonEditor.svelte';
	import { rockTypes } from '$lib/config.js';
	import {
		DEFAULT_OUTLINE_CURVE_TENSION,
		PILLAR_OUTLINE_CURVE_TENSION
	} from '$lib/assets/js/outline-geometry.js';

	let {
		showMapModal = $bindable(false),
		showJsonEditor = false,
		topoJsonText = $bindable(''),
		topoJsonError = '',
		onformatjson,
		onapplyjson,
		mobile = false
	} = $props();

	let selectedTextLabel = $derived(
		(userState.topo.textLabels || []).find((label) => label.id === userState.ui.selectedTextLabelId)
	);
	let selectedOutline = $derived(
		(userState.topo.outlines || []).find((outline) => outline.id === userState.ui.selectedOutlineId)
	);

	function deleteSelectedText() {
		userState.topo.textLabels = (userState.topo.textLabels || []).filter(
			(label) => label.id !== selectedTextLabel.id
		);
		userState.ui.selectedTextLabelId = null;
	}

	function deleteSelectedOutline() {
		userState.topo.outlines = (userState.topo.outlines || []).filter(
			(outline) => outline.id !== selectedOutline.id
		);
		userState.ui.selectedOutlineId = null;
	}

	function setSelectedOutlineCurved(enabled) {
		const defaultTension =
			selectedOutline.shape?.preset === 'pillar'
				? PILLAR_OUTLINE_CURVE_TENSION
				: DEFAULT_OUTLINE_CURVE_TENSION;
		selectedOutline.curve = {
			enabled,
			tension: selectedOutline.curve?.tension ?? defaultTension
		};
	}

	function setSelectedOutlineCurveTension(tension) {
		selectedOutline.curve = {
			enabled: Boolean(selectedOutline.curve?.enabled),
			tension: Number(tension)
		};
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

		<div class="space-y-1.5 px-1">
			<label for="name-mobile" class="label-studio">{$_('ui.name')}</label>
			<input
				type="text"
				id="name-mobile"
				bind:value={userState.topo.name}
				class="input-studio w-full"
				placeholder={$_('ui.name_placeholder')}
			/>
		</div>
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
				<label for="name" class="text-ui-label block">{$_('ui.name')}</label>
				<input
					type="text"
					id="name"
					bind:value={userState.topo.name}
					class="input-studio w-full"
					placeholder={$_('ui.name_placeholder')}
				/>
			</div>

			<div class="space-y-0.5">
				<label for="author" class="text-ui-label block">{$_('ui.author')}</label>
				<input
					type="text"
					id="author"
					bind:value={userState.topo.author}
					class="input-studio w-full"
					placeholder={$_('ui.author_placeholder')}
				/>
			</div>

			<div class="space-y-0.5">
				<label for="rock" class="text-ui-label block">{$_('ui.rock_type')}</label>
				<select
					id="rock"
					bind:value={userState.topo.rock}
					class="input-studio w-full appearance-none"
				>
					{#each rockTypes as rockType}
						<option value="{rockType}">{$_(`rock_types.${rockType}`)}</option>

					{/each}
				</select>
			</div>

			<div class="space-y-0.5">
				<label class="text-ui-label block">{$_('ui.location')}</label>
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
								<div class="text-micro-data font-mono truncate leading-none text-near-black font-bold">
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
					bind:value={userState.topo.description}
					rows="2"
					class="input-studio w-full resize-none"
					placeholder={$_('ui.description_placeholder')}
				></textarea>
			</div>

			<div class="space-y-0.5">
				<label class="text-ui-label block">{$_('ui.tags')}</label>
				<TagSelector bind:selectedTags={userState.topo.tags} availableTags={availableTopoTags} />
			</div>

			{#if selectedTextLabel}
				<div class="space-y-2 p-2 rounded-sm bg-warm-white border border-black/10">
					<div class="flex items-center justify-between">
						<label class="text-ui-label block">Selected text</label>
						<button
							class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
							title="Delete text"
							onclick={deleteSelectedText}
						>
							<i class="fa-solid fa-trash-can text-[10px]"></i>
						</button>
					</div>
					<input type="text" bind:value={selectedTextLabel.text} class="input-studio w-full" />
					<div class="grid grid-cols-3 gap-1.5">
						<div class="space-y-0.5">
							<label class="text-ui-label block">Size</label>
							<input
								type="number"
								min="0.01"
								max="0.08"
								step="0.005"
								bind:value={selectedTextLabel.fontSize2D}
								class="input-studio w-full"
							/>
						</div>
						<div class="space-y-0.5">
							<label class="text-ui-label block">Color</label>
							<input
								type="color"
								bind:value={selectedTextLabel.color}
								class="input-studio w-full h-8 p-1"
							/>
						</div>
						<div class="space-y-0.5">
							<label class="text-ui-label block">Weight</label>
							<select
								bind:value={selectedTextLabel.fontWeight}
								class="input-studio w-full appearance-none"
							>
								<option value={400}>Regular</option>
								<option value={700}>Bold</option>
								<option value={900}>Heavy</option>
							</select>
						</div>
					</div>
				</div>
			{/if}

			{#if selectedOutline}
				<div class="space-y-2 p-2 rounded-sm bg-warm-white border border-black/10">
					<div class="flex items-center justify-between">
						<label class="text-ui-label block">Selected outline</label>
						<button
							class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
							title="Delete outline"
							onclick={deleteSelectedOutline}
						>
							<i class="fa-solid fa-trash-can text-[10px]"></i>
						</button>
					</div>
					<select
						value={selectedOutline.lineStyle || 'rock'}
						onchange={(e) => (selectedOutline.lineStyle = e.currentTarget.value)}
						class="input-studio w-full appearance-none"
					>
						{#each outlineLineStyles as style}
							<option value={style.id}>{style.label}</option>
						{/each}
					</select>
					<label class="flex items-center justify-between gap-2 text-ui-label">
						<span>{$_('ui.curved_outline')}</span>
						<input
							type="checkbox"
							checked={Boolean(selectedOutline.curve?.enabled)}
							onchange={(event) => setSelectedOutlineCurved(event.currentTarget.checked)}
						/>
					</label>
					{#if selectedOutline.curve?.enabled}
						<div class="space-y-0.5">
							<label for="outline-curve-tension" class="text-ui-label block">
								{$_('ui.curve_amount')}
							</label>
							<input
								id="outline-curve-tension"
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={selectedOutline.curve.tension ?? DEFAULT_OUTLINE_CURVE_TENSION}
								oninput={(event) => setSelectedOutlineCurveTension(event.currentTarget.value)}
								class="w-full"
							/>
						</div>
					{/if}
				</div>
			{/if}

			{#if userState.topo.editorMode === '2d'}
				<div class="pt-2 border-t border-black/15">
					<ImageUploader />
				</div>
			{/if}
		</div>
	</div>
{/if}
