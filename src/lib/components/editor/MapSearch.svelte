<script>
	import { onDestroy } from 'svelte';
	import { maptilerApiKey } from '$lib/config';

	let { map = null, embedded = false } = $props();

	let searchQuery = $state('');
	let results = $state([]);
	let isSearching = $state(false);
	let searchError = $state('');
	let selectedFeature = $state(null);
	let abortController = null;
	let resultPanelClass = $derived(
		embedded ? 'fixed top-14 left-2 right-2 z-[60] panel shadow-panel bg-white' : ''
	);

	$effect(() => {
		const query = searchQuery.trim();
		searchError = '';
		selectedFeature = null;

		if (abortController) abortController.abort();

		if (query.length < 3) {
			results = [];
			isSearching = false;
			return;
		}

		isSearching = true;
		const timeout = setTimeout(() => {
			searchPlaces(query);
		}, 350);

		return () => {
			clearTimeout(timeout);
		};
	});

	onDestroy(() => {
		if (abortController) abortController.abort();
	});

	async function searchPlaces(query) {
		if (!maptilerApiKey) {
			searchError = 'Search unavailable';
			return;
		}
		abortController = new AbortController();
		const params = new URLSearchParams({
			key: maptilerApiKey,
			limit: '6',
			autocomplete: 'true',
			fuzzyMatch: 'true',
			language: 'de,en'
		});

		const proximity = map?.getCenter?.();
		if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);

		try {
			const response = await fetch(
				`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`,
				{ signal: abortController.signal }
			);

			if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);

			const data = await response.json();
			results = data.features || [];
			searchError = '';
		} catch (error) {
			if (error.name === 'AbortError') return;
			results = [];
			searchError = 'Search unavailable';
		} finally {
			isSearching = false;
		}
	}

	function selectFeature(feature) {
		const center = getFeatureCenter(feature);
		if (!center || !map) return;

		selectedFeature = feature;

		if (feature.bbox?.length === 4) {
			map.fitBounds(
				[
					[feature.bbox[0], feature.bbox[1]],
					[feature.bbox[2], feature.bbox[3]]
				],
				{ padding: 80, maxZoom: 15, duration: 600 }
			);
		} else {
			map.easeTo({ center, zoom: Math.max(map.getZoom(), 14), duration: 600 });
		}

		clearSearch();
	}

	function clearSearch() {
		searchQuery = '';
		results = [];
		selectedFeature = null;
		searchError = '';
	}

	function handleKeydown(event) {
		if (event.key === 'Enter' && results.length > 0) {
			event.preventDefault();
			selectFeature(results[0]);
		} else if (event.key === 'Escape') {
			clearSearch();
		}
	}

	function getFeatureCenter(feature) {
		if (feature?.center?.length === 2) return feature.center;
		if (feature?.geometry?.type === 'Point' && feature.geometry.coordinates?.length === 2) {
			return feature.geometry.coordinates;
		}
		return null;
	}

	function getFeatureTitle(feature) {
		return (
			feature.text_de || feature.text_en || feature.text || feature.place_name || 'Unnamed place'
		);
	}

	function getFeatureSubtitle(feature) {
		const title = getFeatureTitle(feature);
		const placeName = feature.place_name_de || feature.place_name_en || feature.place_name || '';
		if (!placeName || placeName === title) return getFeatureType(feature);
		return placeName;
	}

	function getFeatureType(feature) {
		return (
			feature.place_type_name?.[0] || feature.place_type?.[0] || feature.properties?.kind || 'place'
		);
	}
</script>

<div class={`${embedded ? '' : 'panel shadow-panel'} bg-white w-full overflow-hidden`}>
	<div class="flex items-center gap-2 p-1.5">
		<div class="w-7 h-7 flex items-center justify-center text-warm-gray-400 flex-shrink-0">
			<i class="fa-solid fa-magnifying-glass text-[11px]"></i>
		</div>
		<input
			type="search"
			bind:value={searchQuery}
			onkeydown={handleKeydown}
			class="input-studio flex-1 !border-0 !shadow-none !bg-transparent !px-0"
			placeholder="Search mountain, address, place..."
			autocomplete="off"
			spellcheck="false"
		/>
		{#if isSearching}
			<div class="w-7 h-7 flex items-center justify-center text-creator-blue">
				<i class="fa-solid fa-spinner fa-spin text-[11px]"></i>
			</div>
		{/if}
	</div>

	{#if searchError}
		<div class={`${resultPanelClass} px-3 pb-2 text-micro-data text-rose-600 font-bold`}>
			{searchError}
		</div>
	{:else if results.length > 0}
		<div
			class={`${resultPanelClass} border-t border-black/10 p-1.5 max-h-72 overflow-y-auto custom-scrollbar`}
		>
			{#each results as feature}
				<div
					class={`group flex items-center gap-2 rounded-sm p-1.5 transition-none ${selectedFeature === feature ? 'bg-creator-blue/10' : 'hover:bg-black/5'}`}
				>
					<button class="min-w-0 flex-1 text-left" onclick={() => selectFeature(feature)}>
						<div class="text-body-text font-bold text-near-black truncate">
							{getFeatureTitle(feature)}
						</div>
						<div class="text-micro-data text-warm-gray-400 truncate">
							{getFeatureSubtitle(feature)}
						</div>
					</button>
					<div class="text-[9px] font-bold uppercase text-warm-gray-300 w-14 truncate text-right">
						{getFeatureType(feature)}
					</div>
				</div>
			{/each}
		</div>
	{:else if searchQuery.trim().length >= 3 && !isSearching}
		<div
			class={`${resultPanelClass} border-t border-black/10 px-3 py-2 text-micro-data text-warm-gray-400 font-bold`}
		>
			No results
		</div>
	{/if}
</div>
