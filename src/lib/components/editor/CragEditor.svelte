<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import { _ } from 'svelte-i18n';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { userState } from '$lib/state/editor.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import CragEditorToolbar from '$lib/components/editor/crag/CragEditorToolbar.svelte';
	import CragEditorSidebar from '$lib/components/editor/crag/CragEditorSidebar.svelte';
	import { writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import {
		createPolygonAround,
		getGeometryCenter,
		getSectorEntryPath,
		pathBasename,
		pathDirname,
		translateGeometryTo
	} from '$lib/assets/js/sector-utils.js';
	import {
		getGeometryPath,
		insertGeometryVertex,
		moveGeometryVertex,
		removeGeometryVertex
	} from '$lib/assets/js/geometry-path-adapters.js';
	import { getEditablePath, getPathMidpoints } from '$lib/assets/js/path-geometry.js';
	import { storage } from '$lib/assets/js/storage-utils.js';

	let { inspectorShadow = true } = $props();

	let mapElement = $state();
	let map = $state();
	let cragMarker;
	let sectorMarkers = $state([]);
	let transitMarkers = $state([]);
	let parkingMarkers = $state([]);
	let mapStyle = $state('transport');
	let currentLoadedStyle = $state();
	let isMapLoaded = $state(false);
	let saveStatus = $state('idle');
	let saveError = $state('');

	let activeTool = $state('position'); // 'position' | 'transit' | 'parking' | 'track'
	let activeTab = $state('info'); // 'info' | 'registry'
	let selectedSectorId = $state(null);
	let currentTrackPoints = $state([]);
	let routeDraftWaypoints = $state([]);
	let editingTrackIndex = $state(null);
	let trackDraftMode = $state('routing'); // 'routing' | 'editing'
	let isSnappingEnabled = $state(true);
	let isRoutingTrack = $state(false);
	let detectedAssets = $state([]);
	let hoverMarker = null;
	let draggingTrackPointIndex = null;
	let draggingSectorVertex = null;
	let draggingSectorMarkerId = null;
	let selectedSectorVertex = $state(null);
	let vertexDeleteUndo = $state(null);
	let vertexDeleteUndoTimer = null;
	let areTrackPointDragHandlersReady = false;
	let areSectorEditHandlersReady = false;
	let suppressNextMapClick = false;
	let canAutosaveSession = $state(false);
	let autosaveSessionTimeout;

	const CRAG_SESSION_KEY = 'crag_editor_latest_session_v1';
	const cragTypes = ['sports-climbing', 'multi-pitch', 'bouldering', 'trad'];

	const availableTags = [
		'Kinderfreundlich',
		'Regensicher',
		'Kurzer Zustieg',
		'Alpin',
		'Brüchig',
		'Beliebt',
		'Morgensonne',
		'Abendsonne',
		'Schattig',
		'Technisch',
		'Kraft',
		'Ausdauer',
		'Leisten',
		'Löcher',
		'Riss',
		'Platte',
		'Überhang',
		'Weite Haken',
		'Abgespeckt',
		'Klassiker',
		'Boulder-Start'
	];

	const securityOptions = ['Sehr Gut', 'Gut', 'Mittel', 'Alpine'];
	const rockTypes = [
		'limestone',
		'granite',
		'gneiss',
		'dolomite',
		'sandstone',
		'basalt',
		'tuff',
		'rhyolite',
		'quartzite',
		'conglomerate',
		'schist',
		'slate'
	];
	const commonEquipment = [
		'Expressschlingen',
		'Friends',
		'Keile',
		'Seil',
		'Helm',
		'Eisschrauben',
		'Eisgeräte'
	];

	function slugifyName(value, fallback = 'new-crag') {
		return (value || fallback)
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || fallback;
	}

	function normalizeSavePath(path = '') {
		return String(path).replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
	}

	function getCragEntryPath(crag) {
		const slug = slugifyName(crag.name);
		const currentPath = normalizeSavePath(crag.path || '');
		if (!currentPath) return '';
		if (pathBasename(currentPath) === slug) return currentPath;
		const parent = pathDirname(currentPath) || currentPath;
		return normalizeSavePath(`${parent}/${slug}`);
	}

	function getCragId(crag) {
		return crag.id || crag.path?.split('/').filter(Boolean).at(-1) || slugifyName(crag.name);
	}

	function getTopoId(crag, sector = null) {
		const cragId = getCragId(crag);
		return sector?.id ? `${cragId}:${sector.id}` : cragId;
	}

	function isBlankCragSession() {
		return (
			!cragEditorState.crag.id &&
			!cragEditorState.crag.name &&
			!cragEditorState.crag.path &&
			!cragEditorState.crag.description_de &&
			!cragEditorState.crag.description_en &&
			(cragEditorState.crag.equipment || []).length === 0 &&
			(cragEditorState.crag.sectors || []).length === 0 &&
			(cragEditorState.transit || []).length === 0 &&
			(cragEditorState.parking || []).length === 0 &&
			(cragEditorState.tracks || []).length === 0
		);
	}

	function restoreLatestCragSession() {
		const session = storage.get(CRAG_SESSION_KEY, null);
		if (!session) return;

		cragEditorState.crag = session.crag || cragEditorState.crag;
		cragEditorState.transit = session.transit || [];
		cragEditorState.parking = session.parking || [];
		cragEditorState.tracks = session.tracks || [];
	}

	function saveLatestCragSession() {
		storage.set(CRAG_SESSION_KEY, {
			crag: $state.snapshot(cragEditorState.crag),
			transit: $state.snapshot(cragEditorState.transit),
			parking: $state.snapshot(cragEditorState.parking),
			tracks: $state.snapshot(cragEditorState.tracks),
			updated: new Date().toISOString()
		});
	}

	onMount(() => {
		if (isBlankCragSession()) restoreLatestCragSession();
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

		canAutosaveSession = true;

		map.on('click', async (e) => {
			if (suppressNextMapClick) {
				suppressNextMapClick = false;
				return;
			}

			if (
				activeTool === 'track' &&
				currentTrackPoints.length === 0 &&
				map.getLayer('tracks-line-saved')
			) {
				const features = map.queryRenderedFeatures(e.point, { layers: ['tracks-line-saved'] });
				const trackIndex = Number(features[0]?.properties?.trackIndex);
				if (Number.isInteger(trackIndex)) {
					editTrack(trackIndex);
					return;
				}
			}

			if (map.getLayer('detection-points')) {
				const bbox = [
					[e.point.x - 30, e.point.y - 30],
					[e.point.x + 30, e.point.y + 30]
				];
				const features = map.queryRenderedFeatures(bbox, { layers: ['detection-points'] });
				if (features.length > 0) {
					const closest = features.reduce((prev, curr) => {
						const prevDist = turf.distance(turf.point(e.lngLat.toArray()), prev);
						const currDist = turf.distance(turf.point(e.lngLat.toArray()), curr);
						return currDist < prevDist ? curr : prev;
					});
					const assetId = closest.properties.id;
					const asset = detectedAssets.find((a) => a.id === assetId);
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
				if (!selectedSectorId) setCragPosition(lngLat);
			} else if (activeTool === 'transit') {
				addTransitPoint(lngLat);
			} else if (activeTool === 'parking') {
				addParkingPoint(lngLat);
			} else if (activeTool === 'track') {
				await addTrackPoint(lngLat);
			}
		});

		const handleKeyDown = (e) => {
			if (activeTool === 'track') {
				if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') handleTrackConfirm();
				else if (e.key === 'Escape') cancelTrackEdit();
				else if (e.key === 'Backspace' || e.key === 'Delete') {
					undoTrackPoint();
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			clearTimeout(vertexDeleteUndoTimer);
			clearTimeout(autosaveSessionTimeout);
			if (map) map.remove();
		};
	});

	$effect(() => {
		if (!canAutosaveSession) return;

		const sessionString = JSON.stringify({
			crag: cragEditorState.crag,
			transit: cragEditorState.transit,
			parking: cragEditorState.parking,
			tracks: cragEditorState.tracks
		});

		if (sessionString) {
			clearTimeout(autosaveSessionTimeout);
			autosaveSessionTimeout = setTimeout(saveLatestCragSession, 1000);
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		syncEditorData();
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		JSON.stringify(cragEditorState.crag.sectors || []);
		selectedSectorId;
		selectedSectorVertex;
		draggingSectorMarkerId;
		untrack(() => {
			if (!draggingSectorMarkerId) syncSectorMarkers();
			syncEditorData();
		});
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
				features: detectedAssets.map((a) => ({
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
		const layers = [
			'Path',
			'Track',
			'Minor road',
			'Minor road outline',
			'Main road',
			'Highway',
			'Road construction',
			'snap-helper'
		].filter((id) => map.getLayer(id));
		const features = map.queryRenderedFeatures(
			[
				[point.x - 20, point.y - 20],
				[point.x + 20, point.y + 20]
			],
			{ layers }
		);
		if (features.length === 0) return originalLngLat;
		let closestPoint = null;
		let minDistance = Infinity;
		features.forEach((feature) => {
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

	async function addTrackPoint(lngLat) {
		if (trackDraftMode === 'editing') {
			currentTrackPoints = [...currentTrackPoints, lngLat];
			return;
		}

		const waypoints = $state.snapshot(routeDraftWaypoints);
		if (waypoints.length === 0) {
			routeDraftWaypoints = [lngLat];
			currentTrackPoints = [lngLat];
			return;
		}

		const points = $state.snapshot(currentTrackPoints);
		isRoutingTrack = true;
		const route = await getRoutedSegment(waypoints[waypoints.length - 1], lngLat);
		isRoutingTrack = false;
		routeDraftWaypoints = [...waypoints, lngLat];
		currentTrackPoints = [...points, ...(route.length > 1 ? route.slice(1) : [lngLat])];
	}

	async function getRoutedSegment(from, to) {
		const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
		const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;
		try {
			const response = await fetch(url);
			if (!response.ok) return [from, to];
			const data = await response.json();
			const route = data.routes?.[0]?.geometry?.coordinates;
			return Array.isArray(route) && route.length > 1 ? route : [from, to];
		} catch {
			return [from, to];
		}
	}

	function handleTrackConfirm() {
		if (trackDraftMode === 'routing') confirmRoutedDraft();
		else finalizeTrack();
	}

	function confirmRoutedDraft() {
		if (currentTrackPoints.length > 1) {
			trackDraftMode = 'editing';
			routeDraftWaypoints = [];
			activeTab = 'registry';
		}
	}

	function startRoutingDraft() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		trackDraftMode = 'routing';
		activeTool = 'track';
	}

	function undoTrackPoint() {
		if (trackDraftMode === 'routing') {
			const waypoints = $state.snapshot(routeDraftWaypoints);
			if (waypoints.length === 0) return;
			rebuildRoutedDraft(waypoints.slice(0, -1));
			return;
		}
		if (currentTrackPoints.length > 0) currentTrackPoints = currentTrackPoints.slice(0, -1);
	}

	async function rebuildRoutedDraft(waypoints) {
		routeDraftWaypoints = waypoints;
		if (waypoints.length < 2) {
			currentTrackPoints = waypoints;
			return;
		}

		isRoutingTrack = true;
		let routedPoints = [waypoints[0]];
		for (let i = 1; i < waypoints.length; i += 1) {
			const route = await getRoutedSegment(waypoints[i - 1], waypoints[i]);
			routedPoints = [...routedPoints, ...(route.length > 1 ? route.slice(1) : [waypoints[i]])];
		}
		isRoutingTrack = false;
		currentTrackPoints = routedPoints;
	}

	function scanNearbyAssets(filterType = null) {
		if (!map || !isMapLoaded) return;
		const coords = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		const features = map.querySourceFeatures('maptiler_planet', { sourceLayer: 'poi' });
		const suggestions = [];
		const seen = new Set();
		features.forEach((f) => {
			const props = f.properties;
			const cls = props.class || '';
			const sub = props.subclass || '';
			let assetCoords =
				f.geometry.type === 'Point'
					? f.geometry.coordinates
					: turf.centroid(f).geometry.coordinates;
			const key = `${props.name || 'unnamed'}-${assetCoords[0].toFixed(4)},${assetCoords[1].toFixed(4)}`;
			if (seen.has(key)) return;
			seen.add(key);
			let type = null;
			if (cls === 'parking' || sub === 'parking') type = 'parking';
			else if (
				cls === 'bus' ||
				cls === 'bus_stop' ||
				sub === 'bus_stop' ||
				sub === 'bus_station' ||
				cls === 'transit' ||
				sub === 'transit'
			)
				type = 'bus';
			else if (
				cls === 'railway' ||
				cls === 'station' ||
				cls === 'subway' ||
				sub === 'station' ||
				sub === 'halt'
			)
				type = 'train';
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
				const exists = [...cragEditorState.transit, ...cragEditorState.parking].some(
					(item) =>
						turf.distance(turf.point(item.coordinates), turf.point(asset.coordinates)) < 0.01
				);
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
		detectedAssets = detectedAssets.filter((a) => a.id !== asset.id);
	}

	function setCragPositionFromSearch(coordinates) {
		if (!coordinates) return;
		setCragPosition(coordinates);
		if (activeTool === 'parking' || activeTool === 'transit') {
			scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		}
	}

	function setCragPosition(coordinates) {
		cragEditorState.crag.geometry.coordinates = coordinates;
		if (cragMarker) cragMarker.setLngLat(coordinates);
	}

	function updateSectorCoordinates(id, coordinates) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id) return sector;
			return {
				...sector,
				geometry: translateGeometryTo(
					sector.geometry || { type: 'Point', coordinates },
					coordinates
				)
			};
		});
	}

	function setSectorGeometryType(id, type) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id || sector.geometry?.type === type) return sector;
			const center = getGeometryCenter(sector.geometry) ||
				cragEditorState.crag.geometry?.coordinates || [0, 0];
			return {
				...sector,
				geometry:
					type === 'Polygon'
						? createPolygonAround(center)
						: { type: 'Point', coordinates: [...center] }
			};
		});
	}

	function initMarkersAndLayers() {
		if (!map) return;
		if (!map.getSource('maptiler_planet'))
			map.addSource('maptiler_planet', {
				type: 'vector',
				url: 'https://api.maptiler.com/tiles/v3/tiles.json?key=ic9EbrsUoaMeSBLjjuEO'
			});
		if (!map.getLayer('snap-helper'))
			map.addLayer({
				id: 'snap-helper',
				type: 'line',
				source: 'maptiler_planet',
				'source-layer': 'transportation',
				paint: { 'line-opacity': 0 },
				layout: { visibility: 'visible' }
			});
		if (!map.getSource('detection-highlights'))
			map.addSource('detection-highlights', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		if (!map.getLayer('detection-points'))
			map.addLayer({
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
		cragMarker = new maplibregl.Marker({ element: el, draggable: true })
			.setLngLat(markerPos)
			.addTo(map);
		cragMarker.on('dragstart', () => {
			detectedAssets = [];
			if (hoverMarker) hoverMarker.remove();
		});
		cragMarker.on('dragend', () => {
			const pos = cragMarker.getLngLat();
			cragEditorState.crag.geometry.coordinates = [pos.lng, pos.lat];
			if (activeTool === 'parking' || activeTool === 'transit')
				scanNearbyAssets(activeTool === 'parking' ? 'parking' : 'transit');
		});
		syncSectorMarkers();

		transitMarkers.forEach((m) => m.marker.remove());
		transitMarkers = [];
		cragEditorState.transit.forEach((p) => createTransitMarker(p));
		parkingMarkers.forEach((m) => m.marker.remove());
		parkingMarkers = [];
		cragEditorState.parking.forEach((p) => createParkingMarker(p));

		if (!map.getSource('crag-editor-data'))
			map.addSource('crag-editor-data', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		if (!map.getLayer('tracks-line-saved'))
			map.addLayer({
				id: 'tracks-line-saved',
				type: 'line',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'state'], 'saved'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: { 'line-color': '#31302e', 'line-width': 4 }
			});
		if (!map.getLayer('tracks-line-drawing'))
			map.addLayer({
				id: 'tracks-line-drawing',
				type: 'line',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'state'], 'drawing'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: { 'line-color': '#0075de', 'line-width': 3, 'line-dasharray': [2, 1] }
			});
		if (!map.getLayer('tracks-points-drawing'))
			map.addLayer({
				id: 'tracks-points-drawing',
				type: 'circle',
				source: 'crag-editor-data',
				filter: ['all', ['==', ['get', 'type'], 'Point'], ['==', ['get', 'state'], 'drawing']],
				paint: {
					'circle-radius': 5,
					'circle-color': '#ffffff',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#0075de'
				}
			});
		if (!map.getLayer('sector-polygons-fill'))
			map.addLayer(
				{
					id: 'sector-polygons-fill',
					type: 'fill',
					source: 'crag-editor-data',
					filter: ['==', ['get', 'feature'], 'sector'],
					paint: {
						'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
						'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
					}
				},
				'tracks-line-saved'
			);
		if (!map.getLayer('sector-polygons-outline'))
			map.addLayer(
				{
					id: 'sector-polygons-outline',
					type: 'line',
					source: 'crag-editor-data',
					filter: ['==', ['get', 'feature'], 'sector'],
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: {
						'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
						'line-width': ['case', ['==', ['get', 'selected'], true], 3, 2],
						'line-opacity': 0.9
					}
				},
				'tracks-line-saved'
			);
		if (!map.getLayer('sector-vertex-midpoints'))
			map.addLayer({
				id: 'sector-vertex-midpoints',
				type: 'circle',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'feature'], 'sector-midpoint'],
				paint: {
					'circle-radius': 5,
					'circle-color': '#ffffff',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#0075de',
					'circle-opacity': 0.85
				}
			});
		if (!map.getLayer('sector-vertices'))
			map.addLayer({
				id: 'sector-vertices',
				type: 'circle',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'feature'], 'sector-vertex'],
				paint: {
					'circle-radius': 7,
					'circle-color': '#0075de',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			});
		if (!map.getLayer('sector-vertex-delete'))
			map.addLayer({
				id: 'sector-vertex-delete',
				type: 'symbol',
				source: 'crag-editor-data',
				filter: ['==', ['get', 'feature'], 'sector-vertex-delete'],
				layout: {
					'text-field': '×',
					'text-font': ['Noto Sans Bold'],
					'text-size': 17,
					'text-offset': [0.85, -0.85],
					'text-allow-overlap': true,
					'text-ignore-placement': true
				},
				paint: {
					'text-color': '#ffffff',
					'text-halo-color': '#dc2626',
					'text-halo-width': 6
				}
			});
		initTrackPointDragHandlers();
		initSectorEditHandlers();
		syncEditorData();
	}

	function initTrackPointDragHandlers() {
		if (!map || areTrackPointDragHandlersReady) return;
		areTrackPointDragHandlersReady = true;

		map.on('mouseenter', 'tracks-points-drawing', () => {
			if (activeTool === 'track' && trackDraftMode === 'editing')
				map.getCanvas().style.cursor = 'move';
		});
		map.on('mouseleave', 'tracks-points-drawing', () => {
			if (draggingTrackPointIndex === null) map.getCanvas().style.cursor = '';
		});
		map.on('mousedown', 'tracks-points-drawing', (e) => {
			if (activeTool !== 'track' || trackDraftMode !== 'editing') return;
			const pointIndex = Number(e.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex)) return;
			e.preventDefault();
			draggingTrackPointIndex = pointIndex;
			map.dragPan.disable();
			map.getCanvas().style.cursor = 'move';
		});
		map.on('mousemove', (e) => {
			if (draggingTrackPointIndex === null) return;
			const points = $state.snapshot(currentTrackPoints);
			if (!points[draggingTrackPointIndex]) return;
			points[draggingTrackPointIndex] = [e.lngLat.lng, e.lngLat.lat];
			currentTrackPoints = points;
		});
		map.on('mouseup', () => {
			if (draggingTrackPointIndex === null) return;
			draggingTrackPointIndex = null;
			suppressNextMapClick = true;
			map.dragPan.enable();
			map.getCanvas().style.cursor = '';
		});
	}

	function initSectorEditHandlers() {
		if (!map || areSectorEditHandlersReady) return;
		areSectorEditHandlersReady = true;

		map.on('click', 'sector-polygons-fill', (e) => {
			const sectorId = e.features?.[0]?.properties?.id;
			if (!sectorId) return;
			suppressNextMapClick = true;
			selectedSectorId = sectorId;
			selectedSectorVertex = null;
			activeTab = 'sectors';
			activeTool = 'position';
		});
		map.on('mouseenter', 'sector-polygons-fill', () => {
			if (activeTool === 'position') map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-polygons-fill', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertices', () => {
			if (activeTool === 'position') map.getCanvas().style.cursor = 'move';
		});
		map.on('mouseleave', 'sector-vertices', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-midpoints', () => {
			if (activeTool === 'position') map.getCanvas().style.cursor = 'copy';
		});
		map.on('mouseleave', 'sector-vertex-midpoints', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-delete', () => {
			if (activeTool === 'position') map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-vertex-delete', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('click', 'sector-vertex-delete', (e) => {
			deleteSelectedSectorVertex(e);
		});
		map.on('touchstart', 'sector-vertex-delete', (e) => {
			deleteSelectedSectorVertex(e);
		});
		map.on('mousedown', 'sector-vertices', (e) => {
			startSectorVertexDrag(e);
		});
		map.on('touchstart', 'sector-vertices', (e) => {
			startSectorVertexDrag(e);
		});
		map.on('mousedown', 'sector-vertex-midpoints', (e) => {
			startSectorMidpointDrag(e);
		});
		map.on('touchstart', 'sector-vertex-midpoints', (e) => {
			startSectorMidpointDrag(e);
		});
		map.on('mousemove', (e) => {
			moveSectorVertexDrag(e);
		});
		map.on('touchmove', (e) => {
			moveSectorVertexDrag(e);
		});
		map.on('mouseup', endSectorVertexDrag);
		map.on('touchend', endSectorVertexDrag);
		map.on('touchcancel', endSectorVertexDrag);
	}

	function getMapEventLngLat(event) {
		const lngLat = event?.lngLat || event?.lngLats?.[0];
		if (!lngLat) return null;
		return [lngLat.lng, lngLat.lat];
	}

	function startSectorVertexDrag(event) {
		if (activeTool !== 'position') return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const vertexIndex = Number(properties.vertexIndex);
		if (!sectorId || !Number.isInteger(vertexIndex)) return;
		event.preventDefault();
		selectedSectorId = sectorId;
		selectedSectorVertex = { sectorId, vertexIndex };
		draggingSectorVertex = { sectorId, vertexIndex };
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		map.getCanvas().style.cursor = 'move';
	}

	function startSectorMidpointDrag(event) {
		if (activeTool !== 'position') return;
		const lngLat = getMapEventLngLat(event);
		if (!lngLat) return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const insertIndex = Number(properties.insertIndex);
		if (!sectorId || !Number.isInteger(insertIndex)) return;
		event.preventDefault();
		selectedSectorId = sectorId;
		selectedSectorVertex = { sectorId, vertexIndex: insertIndex };
		updateSectorGeometry(sectorId, (geometry) =>
			insertGeometryVertex(geometry, insertIndex, lngLat)
		);
		draggingSectorVertex = { sectorId, vertexIndex: insertIndex };
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		map.getCanvas().style.cursor = 'move';
	}

	function moveSectorVertexDrag(event) {
		if (!draggingSectorVertex) return;
		const lngLat = getMapEventLngLat(event);
		if (!lngLat) return;
		event.preventDefault();
		updateSectorGeometry(draggingSectorVertex.sectorId, (geometry) =>
			moveGeometryVertex(geometry, draggingSectorVertex.vertexIndex, lngLat)
		);
	}

	function endSectorVertexDrag() {
		if (!draggingSectorVertex) return;
		draggingSectorVertex = null;
		suppressNextMapClick = true;
		map.dragPan.enable();
		map.touchZoomRotate.enable();
		map.getCanvas().style.cursor = '';
	}

	function cloneGeometry(geometry) {
		return geometry ? JSON.parse(JSON.stringify(geometry)) : geometry;
	}

	function deleteSelectedSectorVertex(event) {
		if (activeTool !== 'position') return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const vertexIndex = Number(properties.vertexIndex);
		if (!sectorId || !Number.isInteger(vertexIndex)) return;
		event.preventDefault();
		suppressNextMapClick = true;
		selectedSectorId = sectorId;
		selectedSectorVertex = null;
		const sector = (cragEditorState.crag.sectors || []).find((item) => item.id === sectorId);
		if (!sector?.geometry) return;
		vertexDeleteUndo = {
			sectorId,
			geometry: cloneGeometry(sector.geometry)
		};
		clearTimeout(vertexDeleteUndoTimer);
		vertexDeleteUndoTimer = setTimeout(() => {
			vertexDeleteUndo = null;
		}, 6000);
		updateSectorGeometry(sectorId, (geometry) => removeGeometryVertex(geometry, vertexIndex));
	}

	function undoSectorVertexDelete() {
		if (!vertexDeleteUndo) return;
		const { sectorId, geometry } = vertexDeleteUndo;
		updateSectorGeometry(sectorId, () => cloneGeometry(geometry));
		selectedSectorId = sectorId;
		selectedSectorVertex = null;
		vertexDeleteUndo = null;
		clearTimeout(vertexDeleteUndoTimer);
	}

	function syncEditorData() {
		const source = map?.getSource('crag-editor-data');
		if (!source) return;
		const features = [];
		const sectors = $state.snapshot(cragEditorState.crag.sectors) || [];
		const savedTracks = $state.snapshot(cragEditorState.tracks) || [];
		const drawingPoints = $state.snapshot(currentTrackPoints) || [];
		sectors.forEach((sector) => {
			if (sector.geometry?.type !== 'Polygon') return;
			const isSelected = selectedSectorId === sector.id;
			features.push({
				type: 'Feature',
				geometry: sector.geometry,
				properties: {
					feature: 'sector',
					id: sector.id || '',
					name: sector.name || '',
					selected: isSelected
				}
			});
			if (!isSelected) return;
			const path = getGeometryPath(sector.geometry);
			const editablePath = getEditablePath(path, { closed: true });
			editablePath.forEach((point, vertexIndex) => {
				const isSelectedVertex =
					selectedSectorVertex?.sectorId === sector.id &&
					selectedSectorVertex?.vertexIndex === vertexIndex;
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: point },
					properties: { feature: 'sector-vertex', sectorId: sector.id, vertexIndex }
				});
				if (isSelectedVertex && editablePath.length > 3) {
					features.push({
						type: 'Feature',
						geometry: { type: 'Point', coordinates: point },
						properties: { feature: 'sector-vertex-delete', sectorId: sector.id, vertexIndex }
					});
				}
			});
			getPathMidpoints(path, { closed: true }).forEach((midpoint) => {
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: midpoint.point },
					properties: {
						feature: 'sector-midpoint',
						sectorId: sector.id,
						insertIndex: midpoint.insertIndex
					}
				});
			});
		});
		savedTracks.forEach((t, index) => {
			if (editingTrackIndex === index) return;
			if (t.coordinates?.length > 1)
				features.push({
					type: 'Feature',
					geometry: { type: 'LineString', coordinates: t.coordinates },
					properties: { name: t.name, state: 'saved', trackIndex: index }
				});
		});
		if (drawingPoints.length > 1)
			features.push({
				type: 'Feature',
				geometry: { type: 'LineString', coordinates: drawingPoints },
				properties: { name: 'Drawing', state: 'drawing' }
			});
		drawingPoints.forEach((p, pointIndex) => {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: p },
				properties: { type: 'Point', state: 'drawing', pointIndex }
			});
		});
		source.setData({ type: 'FeatureCollection', features });
	}

	function updateSectorGeometry(id, updater) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id) return sector;
			return { ...sector, geometry: updater(sector.geometry) };
		});
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
		const marker = new maplibregl.Marker({ element: el, draggable: true })
			.setLngLat(point.coordinates)
			.addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.transit);
			const idx = list.findIndex((p) => p.id === point.id);
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
		const marker = new maplibregl.Marker({ element: el, draggable: true })
			.setLngLat(point.coordinates)
			.addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.parking);
			const idx = list.findIndex((p) => p.id === point.id);
			if (idx !== -1) cragEditorState.parking[idx].coordinates = [pos.lng, pos.lat];
		});
		parkingMarkers.push({ id: point.id, marker });
	}

	function syncSectorMarkers() {
		if (!map) return;
		sectorMarkers.forEach((m) => m.marker.remove());
		sectorMarkers = [];
		(cragEditorState.crag.sectors || []).forEach((sector) => {
			const coordinates = getGeometryCenter(sector.geometry);
			if (!Array.isArray(coordinates) || coordinates.length < 2) return;
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `sector-marker ${selectedSectorId === sector.id ? 'is-selected' : ''}`;
			el.title = sector.name || sector.id || 'Sector';
			el.innerHTML = `<span>${sector.id || 'S'}</span>`;
			el.addEventListener('click', (event) => {
				event.stopPropagation();
				selectedSectorId = sector.id;
				activeTab = 'sectors';
				activeTool = 'position';
			});
			const marker = new maplibregl.Marker({ element: el, draggable: true })
				.setLngLat(coordinates)
				.addTo(map);
			marker.on('dragstart', () => {
				draggingSectorMarkerId = sector.id;
				selectedSectorId = sector.id;
				activeTab = 'sectors';
			});
			marker.on('drag', () => {
				const pos = marker.getLngLat();
				updateSectorCoordinates(sector.id, [pos.lng, pos.lat]);
			});
			marker.on('dragend', () => {
				const pos = marker.getLngLat();
				updateSectorCoordinates(sector.id, [pos.lng, pos.lat]);
				draggingSectorMarkerId = null;
				suppressNextMapClick = true;
			});
			sectorMarkers.push({ id: sector.id, marker });
		});
	}

	function removeTransit(id) {
		cragEditorState.transit = cragEditorState.transit.filter((p) => p.id !== id);
		const m = transitMarkers.find((m) => m.id === id);
		if (m) {
			m.marker.remove();
			transitMarkers = transitMarkers.filter((tm) => tm.id !== id);
		}
	}

	function removeParking(id) {
		cragEditorState.parking = cragEditorState.parking.filter((p) => p.id !== id);
		const m = parkingMarkers.find((m) => m.id === id);
		if (m) {
			m.marker.remove();
			parkingMarkers = parkingMarkers.filter((tm) => tm.id !== id);
		}
	}

	function removeTrack(index) {
		cragEditorState.tracks = cragEditorState.tracks.filter((_, i) => i !== index);
		if (editingTrackIndex === index) cancelTrackEdit();
		else if (editingTrackIndex !== null && editingTrackIndex > index) editingTrackIndex -= 1;
	}

	function finalizeTrack() {
		if (currentTrackPoints.length > 1) {
			const coordinates = $state.snapshot(currentTrackPoints);
			if (editingTrackIndex !== null) {
				cragEditorState.tracks[editingTrackIndex].coordinates = coordinates;
				activeTab = 'registry';
				activeTool = 'track';
				fitTrackBounds(coordinates);
				editingTrackIndex = null;
				currentTrackPoints = [];
				routeDraftWaypoints = [];
				trackDraftMode = 'routing';
				return;
			}

			const nextTracks = [
				...cragEditorState.tracks,
				{
					name: 'Transit Track ' + (cragEditorState.tracks.length + 1),
					coordinates
				}
			];
			cragEditorState.tracks = nextTracks;
			editTrack(nextTracks.length - 1, nextTracks);
		}
	}

	function editTrack(index, tracks = cragEditorState.tracks) {
		const track = tracks[index];
		if (!track?.coordinates?.length) return;
		editingTrackIndex = index;
		currentTrackPoints = track.coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
		activeTool = 'track';
		activeTab = 'registry';
		fitTrackBounds(track.coordinates);
	}

	function cancelTrackEdit() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		trackDraftMode = 'routing';
	}

	function fitTrackBounds(points) {
		if (!map || points.length === 0) return;
		const bounds = points.reduce(
			(b, p) => b.extend(p),
			new maplibregl.LngLatBounds(points[0], points[0])
		);
		map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
	}

	async function handleGpxUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		const text = await file.text();
		const parser = new DOMParser();
		const xml = parser.parseFromString(text, 'text/xml');
		const points = Array.from(xml.querySelectorAll('trkpt'))
			.map((p) => [parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))])
			.filter((p) => !isNaN(p[0]) && !isNaN(p[1]));
		if (points.length > 1) {
			const nextTracks = [
				...cragEditorState.tracks,
				{
					name: file.name.replace('.gpx', ''),
					coordinates: points
				}
			];
			cragEditorState.tracks = nextTracks;
			editTrack(nextTracks.length - 1, nextTracks);
		}
	}

	async function saveToServer() {
		if (!authState.requireAuth(() => saveToServer())) return;

		const savePath = getCragEntryPath(cragEditorState.crag);
		if (!savePath) {
			saveStatus = 'error';
			saveError = $_('save.save_path_required');
			return;
		}
		cragEditorState.crag.path = savePath;

		saveStatus = 'saving';
		saveError = '';

		try {
			const baseName = pathBasename(savePath) || slugifyName(cragEditorState.crag.name);
			cragEditorState.crag.id = cragEditorState.crag.id || baseName;

			// Save main crag JSON
			await writeJson(`${savePath}/${baseName}.json`, {
				type: 'Feature',
				properties: {
					...$state.snapshot(cragEditorState.crag),
					id: cragEditorState.crag.id,
					updated: new Date().toISOString().split('T')[0]
				},
				geometry: cragEditorState.crag.geometry
			});

			// Save transit points
			for (let i = 0; i < cragEditorState.transit.length; i++) {
				const t = cragEditorState.transit[i];
				await writeJson(`${savePath}/${baseName}-transit${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: { name: t.name, type: t.type },
					geometry: { type: 'Point', coordinates: t.coordinates }
				});
			}

			// Save parking spots
			for (let i = 0; i < cragEditorState.parking.length; i++) {
				const p = cragEditorState.parking[i];
				await writeJson(`${savePath}/${baseName}-parking${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: { type: 'parking-space' },
					geometry: { type: 'Point', coordinates: p.coordinates }
				});
			}

			// Save approach tracks
			for (let i = 0; i < cragEditorState.tracks.length; i++) {
				const t = cragEditorState.tracks[i];
				await writeJson(`${savePath}/${baseName}-transit-track${i > 0 ? '-' + i : ''}.json`, {
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: t.coordinates }
				});
			}

			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (err) {
			console.error('Save failed:', err);
			saveStatus = 'error';
			saveError = err.message;
		}
	}

	function createTopoFromCrag() {
		const crag = $state.snapshot(cragEditorState.crag);
		const entryPath = getCragEntryPath(crag);
		if (!entryPath) {
			saveStatus = 'error';
			saveError = 'Choose a parent folder and enter a crag name before creating a topo.';
			return;
		}
		crag.path = entryPath;
		crag.id = crag.id || pathBasename(entryPath);
		cragEditorState.crag.path = entryPath;
		cragEditorState.crag.id = crag.id;

		const sector = (crag.sectors || []).find((item) => item.id === selectedSectorId);
		const source = sector || crag;
		const cragId = getCragId(crag);
		const coordinates =
			getGeometryCenter(source.geometry) || getGeometryCenter(crag.geometry) || [];
		const today = new Date().toISOString().split('T')[0];
		userState.reset();
		userState.topo = {
			...userState.topo,
			id: getTopoId(crag, sector),
			name: sector ? `${crag.name || ''} - ${sector.name || sector.id}` : crag.name || '',
			crag_id: cragId,
			sector_id: sector?.id || '',
			description:
				source.description_de ||
				source.description_en ||
				crag.description_de ||
				crag.description_en ||
				'',
			rock: source.rock_type || crag.rock_type || userState.topo.rock,
			tags: [
				...(crag.tags || []),
				...(crag.type || []),
				...(sector?.tags || []),
				...(sector?.type || [])
			],
			date: crag.date || today,
			updated: today,
			coordinates: [coordinates?.[1] ?? 0, coordinates?.[0] ?? 0],
			editorMode: '2d',
			_entryPath: sector ? getSectorEntryPath(entryPath, sector) : entryPath,
			_topoFileName: `${pathBasename(sector ? getSectorEntryPath(entryPath, sector) : entryPath)}-topo.json`
		};
		userState.ui.workspace = 'topos/2d/editor';
		goto(`${base}/topos/2d/editor`);
	}

	function addEquipmentItem() {
		cragEditorState.crag.equipment = [
			...cragEditorState.crag.equipment,
			{ name: 'Expressschlingen', amount: 12 }
		];
	}

	function removeEquipmentItem(idx) {
		cragEditorState.crag.equipment = cragEditorState.crag.equipment.filter((_, i) => i !== idx);
	}

	function createSector() {
		const sectors = cragEditorState.crag.sectors || [];
		const nextNumber = sectors.length + 1;
		const id = `sector-${nextNumber}`;
		cragEditorState.crag.sectors = [
			...sectors,
			{
				id,
				name: `Sector ${nextNumber}`,
				sort: nextNumber * 10,
				type: [],
				tags: [],
				security: '',
				rock_type: '',
				description_de: '',
				description_en: '',
				approach_de: '',
				approach_en: '',
				geometry: {
					type: 'Point',
					coordinates: [...cragEditorState.crag.geometry.coordinates]
				},
				topo: { site: '', link: '' },
				assets: { topos: [], images: [], models: [], approaches: [] }
			}
		];
		selectedSectorId = id;
		activeTab = 'sectors';
		activeTool = 'position';
	}

	function duplicateSector(id) {
		const sectors = cragEditorState.crag.sectors || [];
		const source = sectors.find((sector) => sector.id === id);
		if (!source) return;
		const copyId = `${source.id || 'sector'}-copy`;
		const uniqueId = sectors.some((sector) => sector.id === copyId)
			? `${copyId}-${sectors.length + 1}`
			: copyId;
		cragEditorState.crag.sectors = [
			...sectors,
			{
				...JSON.parse(JSON.stringify(source)),
				id: uniqueId,
				name: `${source.name || source.id} Copy`,
				sort: (Number(source.sort) || sectors.length * 10) + 1
			}
		];
		selectedSectorId = uniqueId;
		activeTab = 'sectors';
	}

	function removeSector(id) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).filter(
			(sector) => sector.id !== id
		);
		if (selectedSectorId === id) selectedSectorId = null;
	}

	function moveSector(id, direction) {
		const sectors = [...(cragEditorState.crag.sectors || [])];
		const index = sectors.findIndex((sector) => sector.id === id);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= sectors.length) return;
		[sectors[index], sectors[nextIndex]] = [sectors[nextIndex], sectors[index]];
		cragEditorState.crag.sectors = sectors.map((sector, i) => ({ ...sector, sort: (i + 1) * 10 }));
	}
</script>

<div class="h-screen w-screen absolute overflow-hidden bg-warm-white">
	<div bind:this={mapElement} class="w-full h-full grayscale-[0.2]"></div>
</div>

<CragEditorToolbar
	bind:activeTool
	bind:mapStyle
	{currentTrackPoints}
	{editingTrackIndex}
	{trackDraftMode}
	{isRoutingTrack}
	onBack={() => goto(base + '/')}
	onStartRoutingDraft={startRoutingDraft}
	onHandleTrackConfirm={handleTrackConfirm}
	onCancelTrackEdit={cancelTrackEdit}
	onGpxUpload={handleGpxUpload}
	onCreateTopo={createTopoFromCrag}
	onExport={saveToServer}
	status={saveStatus}
	errorMessage={saveError}
/>

<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
	<MapSearch {map} onUsePosition={setCragPositionFromSearch} />
</div>

<CragEditorSidebar
	{inspectorShadow}
	bind:activeTab
	bind:detectedAssets
	{editingTrackIndex}
	{cragTypes}
	{availableTags}
	{securityOptions}
	{rockTypes}
	{commonEquipment}
	bind:selectedSectorId
	onAddEquipmentItem={addEquipmentItem}
	onRemoveEquipmentItem={removeEquipmentItem}
	onAddSector={createSector}
	onDuplicateSector={duplicateSector}
	onRemoveSector={removeSector}
	onMoveSector={moveSector}
	onSetSectorGeometryType={setSectorGeometryType}
	onFocusSector={(sector) => {
		selectedSectorId = sector.id;
		activeTool = 'position';
		const center = getGeometryCenter(sector.geometry);
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}}
	onSetHoverHighlight={setHoverHighlight}
	onAddDetectedAsset={addDetectedAsset}
	onRemoveTransit={removeTransit}
	onRemoveParking={removeParking}
	onEditTrack={editTrack}
	onRemoveTrack={removeTrack}
	onFinalizeTrack={finalizeTrack}
	onCancelTrackEdit={cancelTrackEdit}
/>

{#if vertexDeleteUndo}
	<div
		class="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		<span>Vertex deleted</span>
		<button
			type="button"
			class="rounded-sm bg-white/10 px-2 py-1 text-ui-label font-bold uppercase text-white hover:bg-white/20"
			onclick={undoSectorVertexDelete}
		>
			Undo
		</button>
	</div>
{/if}

<style>
	:global(.maplibregl-ctrl-bottom-right) {
		bottom: 24px !important;
		right: 24px !important;
	}

	:global(.crag-marker),
	:global(.parking-marker),
	:global(.transit-marker),
	:global(.sector-marker) {
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
		cursor: move;
	}

	:global(.sector-marker) {
		min-width: 28px;
		max-width: 120px;
		min-height: 28px;
		border-radius: 999px;
		border: 2px solid #ffffff;
		background: #31302e;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		padding: 0 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.sector-marker.is-selected) {
		background: #0075de;
		box-shadow: 0 0 0 3px rgba(0, 117, 222, 0.25);
	}
</style>
