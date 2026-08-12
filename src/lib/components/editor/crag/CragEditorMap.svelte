<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { loadMapStyle } from '$lib/map-style.js';

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
		let disposed = false;
		void initialiseMap();

		return () => {
			disposed = true;
			if (map) map.remove();
			map = null;
			isMapLoaded = false;
		};

		async function initialiseMap() {
			const coords = initialCoordinates || [0, 0];
			const style = await loadMapStyle(mapStyle).catch(
				() => 'https://demotiles.maplibre.org/style.json'
			);
			if (disposed) return;
			map = new maplibregl.Map({
				container: mapElement,
				style,
				center: [coords[0], coords[1]],
				zoom: 13,
				bearing: 0,
				pitch: 0,
				maxPitch: 85,
				dragRotate: true,
				touchPitch: true,
				pitchWithRotate: true,
				attributionControl: false
			});
			map.on('style.load', () => {
				currentLoadedStyle = mapStyle;
				isMapLoaded = true;
				onStyleLoad(map);
			});

			map.on('click', onMapClick);
		}
	});

	$effect(() => {
		const style = mapStyle;
		if (map && isMapLoaded && style !== currentLoadedStyle) {
			untrack(() => {
				isMapLoaded = false;
				void loadMapStyle(style)
					.then((nextStyle) => map?.setStyle(nextStyle, { diff: true }))
					.catch(() => map?.setStyle('https://demotiles.maplibre.org/style.json', { diff: true }));
				currentLoadedStyle = style;
			});
		}
	});
</script>

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div bind:this={mapElement} class="w-full h-full"></div>
</div>
