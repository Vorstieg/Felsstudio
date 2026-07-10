<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { base } from '$app/paths';

	let {
		map = $bindable(),
		isMapLoaded = $bindable(false),
		mapStyle = 'terrain',
		initialCoordinates = [0, 0],
		onStyleLoad = () => {},
		onMapClick = () => {}
	} = $props();

	let mapElement = $state();
	let currentLoadedStyle = $state();

	onMount(() => {
		const coords = initialCoordinates || [0, 0];
		map = new maplibregl.Map({
			container: mapElement,
			style: `${base}/${mapStyle}.json`,
			center: [coords[0], coords[1]],
			zoom: 13,
			attributionControl: false
		});

		map.on('style.load', () => {
			currentLoadedStyle = mapStyle;
			isMapLoaded = true;
			onStyleLoad(map);
		});

		map.on('click', onMapClick);

		return () => {
			if (map) map.remove();
			map = null;
			isMapLoaded = false;
		};
	});

	$effect(() => {
		const style = mapStyle;
		if (map && isMapLoaded && style !== currentLoadedStyle) {
			untrack(() => {
				isMapLoaded = false;
				map.setStyle(`${base}/${style}.json`, { diff: true });
				currentLoadedStyle = style;
			});
		}
	});
</script>

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div bind:this={mapElement} class="w-full h-full grayscale-[0.2]"></div>
</div>
