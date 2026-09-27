<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { loadMapStyle } from '$lib/map-style.ts';

	type Coordinates = [longitude: number, latitude: number];
	type MapStyle = 'transport' | 'satellite' | 'terrain';
	type Props = {
		map?: MapLibreMap | null;
		isMapLoaded?: boolean;
		mapStyle?: MapStyle;
		initialCoordinates?: Coordinates;
		onStyleLoad?: (_map: MapLibreMap) => void;
		onMapClick?: (_event: MapMouseEvent) => void;
	};

	let {
		map = $bindable<MapLibreMap | null>(null),
		isMapLoaded = $bindable(false),
		mapStyle = 'terrain',
		initialCoordinates = [0, 0] as Coordinates,
		onStyleLoad = () => {},
		onMapClick = () => {}
	}: Props = $props();

	let mapElement = $state<HTMLDivElement | undefined>();
	let currentLoadedStyle = $state<MapStyle | undefined>();

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
			if (disposed || !mapElement) return;
			const currentMap = new maplibregl.Map({
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
			map = currentMap;
			currentMap.on('style.load', () => {
				currentLoadedStyle = mapStyle;
				isMapLoaded = true;
				onStyleLoad(currentMap);
			});

			currentMap.on('click', onMapClick);
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
