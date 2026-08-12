<script>
	import { onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	import { loadMapStyle } from '$lib/map-style.js';
	const topoSession = getTopo2DEditorState();

	let mapContainer = $state();
	let map;

	$effect(() => {
		const gpsData = topoSession.clustering.gpsData;
		const validGpsKeys = Object.keys(gpsData || {})
			.filter((k) => {
				const g = gpsData[k];
				return g && g.latitude !== 0 && g.longitude !== 0;
			})
			.sort((a, b) => parseInt(a) - parseInt(b));

		if (validGpsKeys.length > 0 && mapContainer) {
			if (!map) {
				const center = [
					gpsData[validGpsKeys[Math.floor(validGpsKeys.length / 2)]].longitude,
					gpsData[validGpsKeys[Math.floor(validGpsKeys.length / 2)]].latitude
				];

				void loadMapStyle('terrain')
					.catch(() => 'https://demotiles.maplibre.org/style.json')
					.then((style) => {
						if (map || !mapContainer) return;
						map = new maplibregl.Map({
							container: mapContainer,
							style,
							center,
							zoom: 18,
							attributionControl: false
						});

						map.on('load', () => {
							const points = validGpsKeys.map((key) => [
								gpsData[key].longitude,
								gpsData[key].latitude
							]);
							map.addSource('drone-path', {
								type: 'geojson',
								data: {
									type: 'Feature',
									properties: {},
									geometry: { type: 'LineString', coordinates: points }
								}
							});
							map.addLayer({
								id: 'drone-path-line',
								type: 'line',
								source: 'drone-path',
								layout: { 'line-join': 'round', 'line-cap': 'round' },
								paint: { 'line-color': '#00ffff', 'line-width': 3, 'line-opacity': 0.7 }
							});
							new maplibregl.Marker({ color: '#ff0000' }).setLngLat(center).addTo(map);
							const bounds = points.reduce(
								(bounds, point) => bounds.extend(point),
								new maplibregl.LngLatBounds(points[0], points[0])
							);
							map.fitBounds(bounds, { padding: 20 });
						});
					});
			}
		} else if (map) {
			// Clean up if data is removed
			map.remove();
			map = null;
		}
	});

	onDestroy(() => {
		if (map) {
			map.remove();
		}
	});
</script>

{#if Object.keys(topoSession.clustering.gpsData || {}).length > 0}
	<div class="w-full bg-white border border-black/15 rounded-sm overflow-hidden shadow-sm mt-3">
		<div bind:this={mapContainer} class="w-full h-48 bg-black/5"></div>
	</div>
{/if}
