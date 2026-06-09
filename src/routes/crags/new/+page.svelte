<script>
	import { onMount, untrack } from 'svelte';
	import { _ } from 'svelte-i18n';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';

	let mapElement = $state();
	let map = $state();
	let cragMarker;
	let transitMarkers = $state([]);
	let parkingMarkers = $state([]);
	let mapStyle = $state('transport');
	let currentLoadedStyle = $state();
	let isMapLoaded = $state(false);

	let activeTool = $state('position'); // 'position' | 'transit' | 'parking' | 'track'
	let activeTab = $state('info'); // 'info' | 'registry'
	let currentTrackPoints = $state([]);
	let isSnappingEnabled = $state(true);
	let detectedAssets = $state([]);
	let hoverMarker = null;

	const cragTypes = ['sports-climbing', 'multi-pitch', 'bouldering', 'trad'];

	const availableTags = [
		'Kinderfreundlich', 'Regensicher', 'Kurzer Zustieg', 'Alpin', 'Brüchig', 'Beliebt',
		'Morgensonne', 'Abendsonne', 'Schattig', 'Technisch', 'Kraft', 'Ausdauer',
		'Leisten', 'Löcher', 'Riss', 'Platte', 'Überhang', 'Weite Haken', 'Abgespeckt',
		'Klassiker', 'Boulder-Start'
	];

	const securityOptions = ['Sehr Gut', 'Gut', 'Mittel', 'Alpine'];
	const rockTypes = ['limestone', 'granite', 'gneiss', 'dolomite', 'sandstone', 'basalt', 'tuff', 'rhyolite', 'quartzite', 'conglomerate', 'schist', 'slate'];
	const commonEquipment = ['Expressschlingen', 'Friends', 'Keile', 'Seil', 'Helm', 'Eisschrauben', 'Eisgeräte'];

	onMount(() => {
		const coords = $state.snapshot(cragEditorState.crag.geometry.coordinates);
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
			initMarkersAndLayers();
		});

		map.on('click', (e) => {
			if (map.getLayer('detection-points')) {
				const bbox = [[e.point.x - 30, e.point.y - 30], [e.point.x + 30, e.point.y + 30]];
				const features = map.queryRenderedFeatures(bbox, { layers: ['detection-points'] });
				if (features.length > 0) {
					const closest = features.reduce((prev, curr) => {
						const prevDist = turf.distance(turf.point(e.lngLat.toArray()), prev);
						const currDist = turf.distance(turf.point(e.lngLat.toArray()), curr);
						return currDist < prevDist ? curr : prev;
					});
					const assetId = closest.properties.id;
					const asset = detectedAssets.find(a => a.id === assetId);
					if (asset) {
						addDetectedAsset(asset);
						return;
					}
				}
			}

			let lngLat = [e.lngLat.lng, e.lngLat.lat];
			if (activeTool === 'track' && isSnappingEnabled) {
				lngLat = snapToNearestWay(e.point, lngLat);
			}

			if (activeTool === 'position') {
				if (cragMarker) cragMarker.setLngLat(lngLat);
				cragEditorState.crag.geometry.coordinates = lngLat;
			} else if (activeTool === 'transit') {
				addTransitPoint(lngLat);
			} else if (activeTool === 'parking') {
				addParkingPoint(lngLat);
			} else if (activeTool === 'track') {
				currentTrackPoints = [...currentTrackPoints, lngLat];
			}
		});

		const handleKeyDown = (e) => {
			if (activeTool === 'track') {
				if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') finalizeTrack();
				else if (e.key === 'Escape') currentTrackPoints = [];
				else if (e.key === 'Backspace' || e.key === 'Delete') {
					if (currentTrackPoints.length > 0) currentTrackPoints = currentTrackPoints.slice(0, -1);
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			if (map) map.remove();
		};
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		syncTrackData();
	});

	$effect(() => {
		const tool = activeTool;
		if (tool === 'parking' || tool === 'transit') {
			setTimeout(() => {
				if (activeTool === tool) scanNearbyAssets(tool === 'parking' ? 'parking' : 'transit');
			}, 300);
		} else {
			detectedAssets = [];
			if (hoverMarker) hoverMarker.remove();
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		const source = map.getSource('detection-highlights');
		if (source) {
			source.setData({
				type: 'FeatureCollection',
				features: detectedAssets.map(a => ({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: a.coordinates },
					properties: { type: a.type, id: a.id }
				}))
			});
		}
	});

	$effect(() => {
		const style = mapStyle;
		if (map && isMapLoaded && style !== currentLoadedStyle) {
			untrack(() => {
				map.setStyle(`${base}/${style}.json`, { diff: true });
				currentLoadedStyle = style;
			});
		}
	});

	function snapToNearestWay(point, originalLngLat) {
		if (!map) return originalLngLat;
		const layers = ['Path', 'Track', 'Minor road', 'Minor road outline', 'Main road', 'Highway', 'Road construction', 'snap-helper'].filter(id => map.getLayer(id));
		const features = map.queryRenderedFeatures([[point.x - 20, point.y - 20], [point.x + 20, point.y + 20]], { layers });
		if (features.length === 0) return originalLngLat;
		let closestPoint = null;
		let minDistance = Infinity;
		features.forEach(feature => {
			if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
				const snapped = turf.nearestPointOnLine(feature, turf.point(originalLngLat));
				const dist = turf.distance(turf.point(originalLngLat), snapped);
				if (dist < minDistance) {
					minDistance = dist;
					closestPoint = snapped.geometry.coordinates;
				}
			}
		});
		return closestPoint || originalLngLat;
	}

	function scanNearbyAssets(filterType = null) {
		if (!map || !isMapLoaded) return;
		const coords = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		const features = map.querySourceFeatures('maptiler_planet', { sourceLayer: 'poi' });
		const suggestions = [];
		const seen = new Set();
		features.forEach(f => {
			const props = f.properties;
			const cls = props.class || '';
			const sub = props.subclass || '';
			let assetCoords = f.geometry.type === 'Point' ? f.geometry.coordinates : turf.centroid(f).geometry.coordinates;
			const key = `${props.name || 'unnamed'}-${assetCoords[0].toFixed(4)},${assetCoords[1].toFixed(4)}`;
			if (seen.has(key)) return;
			seen.add(key);
			let type = null;
			if (cls === 'parking' || sub === 'parking') type = 'parking';
			else if (cls === 'bus' || cls === 'bus_stop' || sub === 'bus_stop' || sub === 'bus_station' || cls === 'transit' || sub === 'transit') type = 'bus';
			else if (cls === 'railway' || cls === 'station' || cls === 'subway' || sub === 'station' || sub === 'halt') type = 'train';
			if (type) {
				if (filterType === 'parking' && type !== 'parking') return;
				if (filterType === 'transit' && type !== 'bus' && type !== 'train') return;
				const distance = turf.distance(turf.point(coords), turf.point(assetCoords)) * 1000;
				if (distance > 15000) return;
				const asset = {
					id: Math.random().toString(36).substr(2, 9),
					name: props.name || (type === 'parking' ? 'Parking Area' : 'Station'),
					type,
					coordinates: assetCoords,
					distance
				};
				const exists = [...cragEditorState.transit, ...cragEditorState.parking].some(item => turf.distance(turf.point(item.coordinates), turf.point(asset.coordinates)) < 0.01);
				if (!exists) suggestions.push(asset);
			}
		});
		detectedAssets = suggestions.sort((a, b) => a.distance - b.distance).slice(0, 100);
	}

	function setHoverHighlight(asset) {
		if (!map) return;
		if (hoverMarker) hoverMarker.remove();
		if (!asset) return;
		const el = document.createElement('div');
		el.className = 'hover-ghost-marker pointer-events-none';
		el.style.width = '44px';
		el.style.height = '44px';
		el.style.borderRadius = '50%';
		el.style.border = '4px solid #0075de';
		el.style.backgroundColor = 'rgba(0, 117, 222, 0.2)';
		el.style.boxShadow = '0 0 15px rgba(0, 117, 222, 0.3)';
		el.innerHTML = `<div class=\"w-full h-full flex items-center justify-center text-creator-blue\"><i class=\"fa-solid \${asset.type === 'parking' ? 'fa-square-parking' : (asset.type === 'bus' ? 'fa-bus' : 'fa-train')} text-xl\"></i></div>`;
		hoverMarker = new maplibregl.Marker({ element: el }).setLngLat(asset.coordinates).addTo(map);
		map.easeTo({ center: asset.coordinates, duration: 400 });
	}

	function addDetectedAsset(asset) {
		if (hoverMarker) hoverMarker.remove();
		if (asset.type === 'parking') addParkingPoint(asset.coordinates);
		else {
			const id = Math.random().toString(36).substr(2, 9);
			const point = { id, name: asset.name, type: asset.type, coordinates: asset.coordinates };
			cragEditorState.transit = [...cragEditorState.transit, point];
			createTransitMarker(point);
		}
		detectedAssets = detectedAssets.filter(a => a.id !== asset.id);
	}

	function setCragPositionFromSearch(coordinates) {
		if (!coordinates) return;
		cragEditorState.crag.geometry.coordinates = coordinates;
		if (cragMarker) cragMarker.setLngLat(coordinates);
		if (activeTool === 'parking' || activeTool === 'transit') {
			scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		}
	}

	function initMarkersAndLayers() {
		if (!map) return;
		if (!map.getSource('maptiler_planet')) map.addSource('maptiler_planet', {
			type: 'vector',
			url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=ic9EbrsUoaMeSBLjjuEO'
		});
		if (!map.getLayer('snap-helper')) map.addLayer({
			id: 'snap-helper',
			type: 'line',
			source: 'maptiler_planet',
			'source-layer': 'transportation',
			paint: { 'line-opacity': 0 },
			layout: { 'visibility': 'visible' }
		});
		if (!map.getSource('detection-highlights')) map.addSource('detection-highlights', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
		if (!map.getLayer('detection-points')) map.addLayer({
			id: 'detection-points',
			type: 'circle',
			source: 'detection-highlights',
			paint: {
				'circle-radius': 12,
				'circle-color': '#0075de',
				'circle-opacity': 0.3,
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de',
				'circle-stroke-opacity': 0.7
			}
		});

		const markerPos = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		const el = document.createElement('div');
		el.className = 'crag-marker cursor-move';
		el.style.width = '32px';
		el.style.height = '32px';
		el.style.backgroundImage = `url(${base}/icons/sports-climbing.png)`;
		el.style.backgroundSize = 'cover';
		if (cragMarker) cragMarker.remove();
		cragMarker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(markerPos).addTo(map);
		cragMarker.on('dragstart', () => {
			detectedAssets = [];
			if (hoverMarker) hoverMarker.remove();
		});
		cragMarker.on('dragend', () => {
			const pos = cragMarker.getLngLat();
			cragEditorState.crag.geometry.coordinates = [pos.lng, pos.lat];
			if (activeTool === 'parking' || activeTool === 'transit') scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		});

		transitMarkers.forEach(m => m.marker.remove());
		transitMarkers = [];
		cragEditorState.transit.forEach(p => createTransitMarker(p));
		parkingMarkers.forEach(m => m.marker.remove());
		parkingMarkers = [];
		cragEditorState.parking.forEach(p => createParkingMarker(p));

		if (!map.getSource('crag-editor-data')) map.addSource('crag-editor-data', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
		if (!map.getLayer('tracks-line-saved')) map.addLayer({
			id: 'tracks-line-saved',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'state'], 'saved'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': '#31302e', 'line-width': 4 }
		});
		if (!map.getLayer('tracks-line-drawing')) map.addLayer({
			id: 'tracks-line-drawing',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'state'], 'drawing'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': '#0075de', 'line-width': 3, 'line-dasharray': [2, 1] }
		});
		if (!map.getLayer('tracks-points-drawing')) map.addLayer({
			id: 'tracks-points-drawing',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['all', ['==', ['get', 'type'], 'Point'], ['==', ['get', 'state'], 'drawing']],
			paint: {
				'circle-radius': 4,
				'circle-color': '#ffffff',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de'
			}
		});
		syncTrackData();
	}

	function syncTrackData() {
		const source = map?.getSource('crag-editor-data');
		if (!source) return;
		const features = [];
		const savedTracks = $state.snapshot(cragEditorState.tracks) || [];
		const drawingPoints = $state.snapshot(currentTrackPoints) || [];
		savedTracks.forEach(t => {
			if (t.coordinates?.length > 1) features.push({
				type: 'Feature',
				geometry: { type: 'LineString', coordinates: t.coordinates },
				properties: { name: t.name, state: 'saved' }
			});
		});
		if (drawingPoints.length > 1) features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: drawingPoints },
			properties: { name: 'Drawing', state: 'drawing' }
		});
		drawingPoints.forEach(p => {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: p },
				properties: { type: 'Point', state: 'drawing' }
			});
		});
		source.setData({ type: 'FeatureCollection', features });
	}

	function addTransitPoint(lngLat) {
		const id = Math.random().toString(36).substr(2, 9);
		const point = { id, name: 'New Station', type: 'bus', coordinates: lngLat };
		cragEditorState.transit = [...cragEditorState.transit, point];
		createTransitMarker(point);
	}

	function createTransitMarker(point) {
		const el = document.createElement('div');
		el.className = 'transit-marker group cursor-move';
		el.style.width = '24px';
		el.style.height = '24px';
		el.style.backgroundImage = `url(${base}/icons/${point.type}.png)`;
		el.style.backgroundSize = 'cover';
		const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(point.coordinates).addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.transit);
			const idx = list.findIndex(p => p.id === point.id);
			if (idx !== -1) cragEditorState.transit[idx].coordinates = [pos.lng, pos.lat];
		});
		transitMarkers.push({ id: point.id, marker });
	}

	function addParkingPoint(lngLat) {
		const id = Math.random().toString(36).substr(2, 9);
		const point = { id, coordinates: lngLat };
		cragEditorState.parking = [...cragEditorState.parking, point];
		createParkingMarker(point);
	}

	function createParkingMarker(point) {
		const el = document.createElement('div');
		el.className = 'parking-marker cursor-move';
		el.style.width = '24px';
		el.style.height = '24px';
		el.style.backgroundImage = `url(${base}/icons/parking.png)`;
		el.style.backgroundSize = 'cover';
		const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(point.coordinates).addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.parking);
			const idx = list.findIndex(p => p.id === point.id);
			if (idx !== -1) cragEditorState.parking[idx].coordinates = [pos.lng, pos.lat];
		});
		parkingMarkers.push({ id: point.id, marker });
	}

	function removeTransit(id) {
		cragEditorState.transit = cragEditorState.transit.filter(p => p.id !== id);
		const m = transitMarkers.find(m => m.id === id);
		if (m) {
			m.marker.remove();
			transitMarkers = transitMarkers.filter(tm => tm.id !== id);
		}
	}

	function removeParking(id) {
		cragEditorState.parking = cragEditorState.parking.filter(p => p.id !== id);
		const m = parkingMarkers.find(m => m.id === id);
		if (m) {
			m.marker.remove();
			parkingMarkers = parkingMarkers.filter(tm => tm.id !== id);
		}
	}

	function removeTrack(index) {
		cragEditorState.tracks = cragEditorState.tracks.filter((_, i) => i !== index);
	}

	function finalizeTrack() {
		if (currentTrackPoints.length > 1) {
			cragEditorState.tracks = [...cragEditorState.tracks, {
				name: 'Transit Track ' + (cragEditorState.tracks.length + 1),
				coordinates: $state.snapshot(currentTrackPoints)
			}];
			currentTrackPoints = [];
		}
	}

	async function handleGpxUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		const text = await file.text();
		const parser = new DOMParser();
		const xml = parser.parseFromString(text, 'text/xml');
		const points = Array.from(xml.querySelectorAll('trkpt')).map(p => [parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
		if (points.length > 1) {
			cragEditorState.tracks = [...cragEditorState.tracks, {
				name: file.name.replace('.gpx', ''),
				coordinates: points
			}];
			const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
			if (bounds) map.fitBounds(bounds, { padding: 50 });
		}
	}

	function downloadExport() {
		const baseName = (cragEditorState.crag.name || 'new-crag').trim().toLowerCase().replace(/\s+/g, '-');
		const blob = (data) => new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const save = (b, n) => {
			const url = URL.createObjectURL(b);
			const a = document.createElement('a');
			a.href = url;
			a.download = n;
			a.click();
			URL.revokeObjectURL(url);
		};
		save(blob({
			type: 'Feature',
			properties: {
				...$state.snapshot(cragEditorState.crag),
				id: baseName,
				updated: new Date().toISOString().split('T')[0]
			},
			geometry: cragEditorState.crag.geometry
		}), `${baseName}.json`);
		cragEditorState.transit.forEach((t, i) => save(blob({
			type: 'Feature',
			properties: { name: t.name, type: t.type },
			geometry: { type: 'Point', coordinates: t.coordinates }
		}), `${baseName}-transit${i > 0 ? '-' + i : ''}.json`));
		cragEditorState.parking.forEach((p, i) => save(blob({
			type: 'Feature',
			properties: { type: 'parking-space' },
			geometry: { type: 'Point', coordinates: p.coordinates }
		}), `${baseName}-parking${i > 0 ? '-' + i : ''}.json`));
		cragEditorState.tracks.forEach((t, i) => save(blob({
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates: t.coordinates }
		}), `${baseName}-transit-track${i > 0 ? '-' + i : ''}.json`));
	}

	function addEquipmentItem() {
		cragEditorState.crag.equipment = [...cragEditorState.crag.equipment, { name: 'Expressschlingen', amount: 12 }];
	}

	function removeEquipmentItem(idx) {
		cragEditorState.crag.equipment = cragEditorState.crag.equipment.filter((_, i) => i !== idx);
	}
</script>

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div bind:this={mapElement} class="w-full h-full grayscale-[0.2]"></div>
</div>

<div class="fixed top-2 left-2 right-2 z-50 block">
	<div class="panel p-1.5 flex items-center justify-between shadow-panel bg-white">
		<div class="flex items-center gap-2.5">
			<button
				class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5"
				onclick={() => goto(base + '/')} title="Back to Launcher">
				<i class="fa-solid fa-arrow-left text-[11px]"></i>
			</button>
			<div class="ml-1 mr-3 hidden sm:block">
				<h1 class="text-section-title leading-none">{$_('ui.crag_studio')}</h1>
			</div>
			<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

			<div class="flex items-center gap-1">
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'position' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'position'}>
					<i class="fa-solid fa-location-crosshairs"></i><span class="hidden md:inline">Crag Position</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'parking' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'parking'}>
					<i class="fa-solid fa-square-parking"></i><span class="hidden md:inline">Parking Spot</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'transit' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'transit'}>
					<i class="fa-solid fa-bus"></i><span class="hidden md:inline">Transit Station</span>
				</button>
				<button
					class={`flex items-center gap-2 py-1.5 px-3 rounded-sm text-ui-label transition-none ${activeTool === 'track' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => activeTool = 'track'}>
					<i class="fa-solid fa-route"></i><span class="hidden md:inline">Approach Track</span>
				</button>
			</div>

			<div class="w-px h-5 bg-black/15 mx-1 hidden lg:block"></div>

			<div class="hidden lg:flex items-center gap-1 bg-black/5 rounded-sm p-0.5 border border-black/10">
				{#each ['transport', 'satellite', 'terrain'] as style}
					<button
						onclick={() => mapStyle = style}
						class={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-sm transition-none ${mapStyle === style ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-400 hover:bg-black/5'}`}
					>
						{style}
					</button>
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-4 pr-1">
			{#if activeTool === 'track'}
				<label
					class="flex items-center justify-center gap-1.5 px-3 py-1 bg-black/5 text-creator-blue rounded-sm border border-black/15 cursor-pointer hover:bg-black/10 transition-none mr-2">
					<i class="fa-solid fa-file-import text-[10px]"></i><span
					class="text-[10px] font-bold uppercase tracking-widest">Import GPX</span>
					<input type="file" accept=".gpx" class="hidden" onchange={handleGpxUpload} />
				</label>
			{/if}

			<button
				class="bg-near-black text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-black transition-none uppercase tracking-widest"
				onclick={downloadExport}>
				Export
			</button>
		</div>
	</div>
	</div>

	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
		<MapSearch {map} onUsePosition={setCragPositionFromSearch} />
	</div>

	<div class="fixed top-14 right-2 z-50 flex flex-col w-80 max-h-[calc(100vh-4rem)]">
	<div class="panel flex-1 flex flex-col overflow-hidden shadow-panel">
		<div class="flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 flex-shrink-0">
			<div>
				<h1 class="text-section-title">Properties</h1>
				<p class="text-ui-label !m-0">Crag Inspector</p>
			</div>
		</div>

		<div class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 flex-shrink-0">
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'info' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => activeTab = 'info'}><i class="fa-solid fa-circle-info mr-1.5"></i> Metadata
			</button>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none {activeTab === 'registry' ? 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => activeTab = 'registry'}><i class="fa-solid fa-layer-group mr-1.5"></i> Registry <span
				class="ml-1 text-micro-data {activeTab === 'registry' ? 'text-warm-gray-400' : 'text-warm-gray-400'}">{cragEditorState.transit.length + cragEditorState.parking.length + cragEditorState.tracks.length}</span>
			</button>
		</div>

		<div class="overflow-y-auto flex-1 p-3 pt-0 custom-scrollbar bg-transparent">
			{#if activeTab === 'info'}
				<div class="space-y-4">
					<h3 class="text-ui-label text-near-black flex items-center gap-2">
						<div class="w-1.5 h-1.5 rounded-sm bg-creator-blue"></div>
						Base Information
					</h3>
					<div class="space-y-3">
						<div class="space-y-0.5"><label class="text-ui-label block">Crag Name</label><input type="text"
																																																bind:value={cragEditorState.crag.name}
																																																class="input-studio w-full"
																																																placeholder="e.g. Efeugrat" />
						</div>
						<div class="space-y-0.5"><label class="text-ui-label block">Path Segment</label><input type="text"
																																																	 bind:value={cragEditorState.crag.path}
																																																	 class="input-studio w-full font-mono"
																																																	 placeholder="e.g. lower-austria/mödling/efeugrat" />
						</div>

						<div class="grid grid-cols-2 gap-2">
							<div class="space-y-0.5"><label class="text-ui-label block">Security</label><select
								bind:value={cragEditorState.crag.security} class="input-studio w-full appearance-none">
								<option value="">Select...</option>
								{#each securityOptions as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select></div>
							<div class="space-y-0.5"><label class="text-ui-label block">Rock Type</label><select
								bind:value={cragEditorState.crag.rock_type} class="input-studio w-full appearance-none">
								<option value="">Select...</option>
								{#each rockTypes as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select></div>
						</div>

						<div class="space-y-0.5"><label class="text-ui-label block">Crag Type</label>
							<div>
								<TagSelector bind:selectedTags={cragEditorState.crag.type} availableTags={cragTypes} />
							</div>
						</div>
						<div class="space-y-0.5"><label class="text-ui-label block">Tags</label>
							<div>
								<TagSelector bind:selectedTags={cragEditorState.crag.tags} availableTags={availableTags} />
							</div>
						</div>

						<div class="space-y-1 pt-2 border-t border-black/15">
							<div class="flex justify-between items-center"><label class="text-ui-label !m-0">Equipment</label>
								<button onclick={addEquipmentItem}
												class="text-ui-label text-creator-blue hover:text-creator-blue-active">+ Add
								</button>
							</div>
							<div class="space-y-1">
								{#each cragEditorState.crag.equipment as item, i}
									<div class="flex gap-1 items-center bg-white p-1 rounded-sm border border-black/15 shadow-sm">
										<select bind:value={item.name}
														class="flex-1 bg-transparent px-1 py-1 text-body-text outline-none border-none">
											{#each commonEquipment as name}
												<option value={name}>{name}</option>
											{/each}
										</select>
										<input type="number" bind:value={item.amount}
													 class="w-10 bg-black/5 px-1 py-1 rounded-sm text-body-text outline-none text-center" />
										<button onclick={() => removeEquipmentItem(i)}
														class="text-warm-gray-300 hover:text-rose-600 px-1.5 transition-none"><i
											class="fa-solid fa-trash-can text-[10px]"></i></button>
									</div>
								{/each}
							</div>
						</div>

						<div class="space-y-0.5 pt-2 border-t border-black/15"><label class="text-ui-label block">Description
							(DE)</label><textarea bind:value={cragEditorState.crag.description_de} rows="2"
																		class="input-studio w-full resize-none"></textarea></div>
						<div class="space-y-0.5"><label class="text-ui-label block">Description (EN)</label><textarea
							bind:value={cragEditorState.crag.description_en} rows="2"
							class="input-studio w-full resize-none"></textarea></div>
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#if detectedAssets.length > 0}
						<div class="bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5 mb-1">
							<div class="flex justify-between items-center"><span
								class="text-ui-label text-creator-blue">{$_('ui.nearby_suggestions')}</span>
								<button class="text-micro-data font-bold text-warm-gray-400 hover:text-near-black"
												onclick={() => { detectedAssets = []; setHoverHighlight(null); }}>{$_('ui.dismiss')}</button>
							</div>
							<div class="space-y-1">
								{#each detectedAssets as asset}
									<div
										class="bg-white rounded-sm p-1.5 shadow-sm border border-black/15 flex items-center justify-between gap-2 group transition-none hover:border-creator-blue"
										onmouseenter={() => setHoverHighlight(asset)} onmouseleave={() => setHoverHighlight(null)}>
										<div class="flex items-center gap-2">
											<div
												class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data">
												{#if asset.type === 'parking'}<i
													class="fa-solid fa-square-parking"></i>{:else if asset.type === 'bus'}<i
													class="fa-solid fa-bus"></i>{:else}<i class="fa-solid fa-train"></i>{/if}
											</div>
											<div class="min-w-0"><p
												class="text-body-text font-bold text-near-black truncate leading-tight w-28">{asset.name}</p>
											</div>
										</div>
										<button
											class="px-2 py-1 bg-near-black text-white rounded-sm text-micro-data font-bold hover:bg-black"
											onclick={() => addDetectedAsset(asset)}>Add
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if cragEditorState.transit.length === 0 && cragEditorState.parking.length === 0 && cragEditorState.tracks.length === 0 && detectedAssets.length === 0}
						<div class="bg-warm-white rounded-sm p-6 text-center border border-black/15 mt-2">
							<i class="fa-solid fa-layer-group text-2xl text-warm-gray-300 mb-2 block"></i>
							<p class="text-ui-label text-warm-gray-500">Inventory Empty</p>
						</div>
					{/if}

					{#each cragEditorState.transit as point}
						<div class="panel-inner p-2 flex flex-col gap-2 transition-none border-black/10 hover:border-creator-blue">
							<div class="flex justify-between items-center">
								<div class="flex items-center gap-2">
									<div
										class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
										<i class="fa-solid fa-bus text-[10px]"></i></div>
									<span class="text-ui-label text-near-black !m-0">Transit Point</span></div>
								<button onclick={() => removeTransit(point.id)}
												class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center">
									<i class="fa-solid fa-trash-can text-[10px]"></i></button>
							</div>
							<div class="flex gap-1.5"><select bind:value={point.type} class="input-studio w-16 !px-1 appearance-none">
								<option value="bus">Bus</option>
								<option value="train">Train</option>
							</select><input type="text" bind:value={point.name} class="input-studio flex-1"
															placeholder="Station Name" /></div>
						</div>
					{/each}

					{#each cragEditorState.parking as park}
						<div
							class="panel-inner p-2 flex justify-between items-center transition-none border-black/10 hover:border-creator-blue">
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 border border-black/10">
									<i class="fa-solid fa-square-parking text-[10px]"></i></div>
								<span class="text-ui-label text-near-black !m-0">Parking Space</span></div>
							<button onclick={() => removeParking(park.id)}
											class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center">
								<i class="fa-solid fa-trash-can text-[10px]"></i></button>
						</div>
					{/each}

					{#each cragEditorState.tracks as track, i}
						<div class="panel-inner p-2 flex flex-col gap-2 transition-none border-black/10 hover:border-creator-blue">
							<div class="flex justify-between items-center">
								<div class="flex items-center gap-2">
									<div
										class="w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 flex items-center justify-center border border-black/10">
										<i class="fa-solid fa-route text-[10px]"></i></div>
									<span class="text-ui-label text-near-black !m-0">Approach Track</span></div>
								<button onclick={() => removeTrack(i)}
												class="w-6 h-6 rounded-sm text-warm-gray-300 hover:bg-rose-50 hover:text-rose-600 transition-none flex items-center justify-center">
									<i class="fa-solid fa-trash-can text-[10px]"></i></button>
							</div>
							<input type="text" bind:value={track.name} class="input-studio w-full" placeholder="Track Name" />
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="mt-2 panel p-2 bg-white flex justify-between items-center shadow-sm border-black/15">
		<span class="text-ui-label text-warm-gray-500 !m-0">GPS</span>
		<div class="font-mono text-micro-data text-creator-blue font-bold">
			{cragEditorState.crag.geometry.coordinates[1].toFixed(5)}
			, {cragEditorState.crag.geometry.coordinates[0].toFixed(5)}
		</div>
	</div>
</div>

<style>
    :global(.maplibregl-ctrl-bottom-right) {
        bottom: 24px !important;
        right: 24px !important;
    }

    :global(.crag-marker), :global(.parking-marker), :global(.transit-marker) {
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
        cursor: move;
    }
</style>
