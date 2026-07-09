import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { base } from '$app/paths';
import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
import { createIconMarkerElement } from '$lib/components/editor/crag/crag-editor-map.js';
import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.js';

export function useCragAccessEditor({ getMap, getIsMapLoaded, getActiveTool }) {
	let detectedAssets = $state([]);
	let transitMarkers = $state([]);
	let parkingMarkers = $state([]);
	let hoverMarker = null;
	let areDetectionPointHandlersReady = false;

	function cleanup() {
		if (hoverMarker) hoverMarker.remove();
		transitMarkers.forEach((item) => item.marker.remove());
		parkingMarkers.forEach((item) => item.marker.remove());
		transitMarkers = [];
		parkingMarkers = [];
	}

	function clearDetectedAssets() {
		detectedAssets = [];
		if (hoverMarker) hoverMarker.remove();
	}

	function scanNearbyAssets(filterType = null) {
		const map = getMap();
		if (!map || !getIsMapLoaded()) return;
		const coords = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		const features = map.querySourceFeatures('maptiler_planet', { sourceLayer: 'poi' });
		const suggestions = [];
		const seen = new Set();
		features.forEach((feature) => {
			const props = feature.properties;
			const cls = props.class || '';
			const sub = props.subclass || '';
			const assetCoords =
				feature.geometry.type === 'Point'
					? feature.geometry.coordinates
					: turf.centroid(feature).geometry.coordinates;
			const key = `${props.name || 'unnamed'}-${assetCoords[0].toFixed(4)},${assetCoords[1].toFixed(4)}`;
			if (seen.has(key)) return;
			seen.add(key);

			let type = null;
			if (cls === 'parking' || sub === 'parking') type = 'parking';
			else if (
				['bus', 'bus_stop', 'transit'].includes(cls) ||
				['bus_stop', 'bus_station', 'transit'].includes(sub)
			)
				type = 'bus';
			else if (['railway', 'station', 'subway'].includes(cls) || ['station', 'halt'].includes(sub))
				type = 'train';
			if (!type) return;
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
				(item) => turf.distance(turf.point(item.coordinates), turf.point(asset.coordinates)) < 0.01
			);
			if (!exists) suggestions.push(asset);
		});
		detectedAssets = suggestions.sort((a, b) => a.distance - b.distance).slice(0, 100);
	}

	function initDetectionPointHandlers() {
		const map = getMap();
		if (!map || areDetectionPointHandlersReady) return;
		areDetectionPointHandlersReady = true;

		map.on('mousemove', (event) => {
			if (!map.getLayer('detection-points') || detectedAssets.length === 0) return;
			const hitRadius = getMapHitRadius(8);
			const features = map.queryRenderedFeatures(
				[
					[event.point.x - hitRadius, event.point.y - hitRadius],
					[event.point.x + hitRadius, event.point.y + hitRadius]
				],
				{ layers: ['detection-points'] }
			);
			if (features.length > 0) map.getCanvas().style.cursor = 'pointer';
			else if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
		});

		map.on('mouseleave', () => {
			if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
		});
	}

	function syncDetectionHighlights() {
		const map = getMap();
		if (!map || !getIsMapLoaded()) return;
		const source = map.getSource('detection-highlights');
		if (!source) return;
		source.setData({
			type: 'FeatureCollection',
			features: detectedAssets.map((asset) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: asset.coordinates },
				properties: { type: asset.type, id: asset.id }
			}))
		});
	}

	function setHoverHighlight(asset) {
		const map = getMap();
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
		el.innerHTML = `<div class="w-full h-full flex items-center justify-center text-creator-blue"><i class="fa-solid ${asset.type === 'parking' ? 'fa-square-parking' : asset.type === 'bus' ? 'fa-bus' : 'fa-train'} text-xl"></i></div>`;
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
		detectedAssets = detectedAssets.filter((item) => item.id !== asset.id);
	}

	function addTransitPoint(lngLat) {
		const id = Math.random().toString(36).substr(2, 9);
		const point = { id, name: 'New Station', type: 'bus', coordinates: lngLat };
		cragEditorState.transit = [...cragEditorState.transit, point];
		createTransitMarker(point);
	}

	function createTransitMarker(point) {
		const map = getMap();
		if (!map) return;
		const marker = new maplibregl.Marker({
			element: createIconMarkerElement({
				className: 'transit-marker group cursor-move',
				iconUrl: `${base}/icons/${point.type}.png`,
				size: getMapMarkerSize(24)
			}),
			draggable: true
		})
			.setLngLat(point.coordinates)
			.addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.transit);
			const idx = list.findIndex((item) => item.id === point.id);
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
		const map = getMap();
		if (!map) return;
		const marker = new maplibregl.Marker({
			element: createIconMarkerElement({
				className: 'parking-marker cursor-move',
				iconUrl: `${base}/icons/parking.png`,
				size: getMapMarkerSize(24)
			}),
			draggable: true
		})
			.setLngLat(point.coordinates)
			.addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const list = $state.snapshot(cragEditorState.parking);
			const idx = list.findIndex((item) => item.id === point.id);
			if (idx !== -1) cragEditorState.parking[idx].coordinates = [pos.lng, pos.lat];
		});
		parkingMarkers.push({ id: point.id, marker });
	}

	function syncAccessMarkers() {
		transitMarkers.forEach((item) => item.marker.remove());
		parkingMarkers.forEach((item) => item.marker.remove());
		transitMarkers = [];
		parkingMarkers = [];
		cragEditorState.transit.forEach((point) => createTransitMarker(point));
		cragEditorState.parking.forEach((point) => createParkingMarker(point));
	}

	function removeTransit(id) {
		cragEditorState.transit = cragEditorState.transit.filter((point) => point.id !== id);
		const item = transitMarkers.find((marker) => marker.id === id);
		if (item) {
			item.marker.remove();
			transitMarkers = transitMarkers.filter((marker) => marker.id !== id);
		}
	}

	function removeParking(id) {
		cragEditorState.parking = cragEditorState.parking.filter((point) => point.id !== id);
		const item = parkingMarkers.find((marker) => marker.id === id);
		if (item) {
			item.marker.remove();
			parkingMarkers = parkingMarkers.filter((marker) => marker.id !== id);
		}
	}

	function scanForActiveTool() {
		const tool = getActiveTool();
		if (tool === 'parking' || tool === 'transit')
			scanNearbyAssets(tool === 'parking' ? 'parking' : 'transit');
		else clearDetectedAssets();
	}

	return {
		get detectedAssets() {
			return detectedAssets;
		},
		scanNearbyAssets,
		scanForActiveTool,
		clearDetectedAssets,
		initDetectionPointHandlers,
		syncDetectionHighlights,
		setHoverHighlight,
		addDetectedAsset,
		addTransitPoint,
		addParkingPoint,
		createTransitMarker,
		createParkingMarker,
		syncAccessMarkers,
		removeTransit,
		removeParking,
		cleanup
	};
}
