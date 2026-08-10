<script>
	import { onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	const userState = getTopoEditorSession();

	let mapContainer = $state();
	let map;

	$effect(() => {
		const gpsData = userState.clustering.gpsData;
		const validGpsKeys = Object.keys(gpsData || {})
            .filter(k => {
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

				map = new maplibregl.Map({
					container: mapContainer,
					style: '/terrain.json',
					center: center,
					zoom: 18,
                    attributionControl: false
				});

                // Add satellite layer if possible, or just default style
                map.on('load', () => {
                    const points = validGpsKeys.map(k => [gpsData[k].longitude, gpsData[k].latitude]);
                    
                    map.addSource('drone-path', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: {},
                            geometry: {
                                type: 'LineString',
                                coordinates: points
                            }
                        }
                    });

                    map.addLayer({
                        id: 'drone-path-line',
                        type: 'line',
                        source: 'drone-path',
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#00ffff',
                            'line-width': 3,
                            'line-opacity': 0.7
                        }
                    });

                    // Add a marker at the center
                    new maplibregl.Marker({ color: '#ff0000' })
                        .setLngLat(center)
                        .addTo(map);

                    // Fit bounds
                    const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
                    map.fitBounds(bounds, { padding: 20 });
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

{#if Object.keys(userState.clustering.gpsData || {}).length > 0}
	<div class="w-full bg-white border border-black/15 rounded-sm overflow-hidden shadow-sm mt-3">
		<div bind:this={mapContainer} class="w-full h-48 bg-black/5"></div>
	</div>
{/if}
