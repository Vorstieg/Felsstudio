import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map, Marker } from 'maplibre-gl';
import * as turf from '@turf/turf';
import type { AccessCollection, CragEditorSession } from '$lib/types/crag';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.ts';
import { base } from '$app/paths';
import { createAccessId } from '$lib/assets/js/access-geojson.ts';
import { createIconMarkerElement } from '$lib/components/editor/crag/crag-editor-map.ts';
import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.ts';

type AccessKind = 'parking' | 'transit' | 'hut' | 'approach';
type DetectableAccessKind = Exclude<AccessKind, 'approach'>;
type TransitMode = 'bus' | 'train';
type Coordinates = [number, number];
type AccessFeature = {
	type: 'Feature';
	id: string;
	geometry: { type: 'Point'; coordinates: Coordinates };
	properties: { kind: AccessKind; name?: string; mode?: TransitMode; [key: string]: unknown };
};
type DetectedAsset = {
	id: string;
	name: string;
	kind: Exclude<AccessKind, 'approach'>;
	mode: TransitMode | null;
	coordinates: Coordinates;
	distance: number;
};
type PointMarker = { id: string; marker: Marker };
type AccessEditorOptions = {
	state: CragEditorSession;
	getMap: () => Map | null | undefined;
	getIsMapLoaded: () => boolean;
	getActiveTool: () => string;
};
const isDetectableAccessKind = (tool: string): tool is DetectableAccessKind =>
	tool === 'parking' || tool === 'transit' || tool === 'hut';

export function useCragAccessEditor({
	state,
	getMap,
	getIsMapLoaded,
	getActiveTool
}: AccessEditorOptions) {
	let detectedAssets = $state<DetectedAsset[]>([]);
	let isDetectionLoading = $state(false);
	let isDetectionZoomLimited = $state(false);
	let pointMarkers = $state<PointMarker[]>([]);
	let hoverMarker: Marker | null = null;
	let areDetectionPointHandlersReady = false;
	let detectionRescanTimeout: ReturnType<typeof setTimeout> | null = null;

	const accessFeatures = (): AccessFeature[] =>
		((state.getWorkspaceAccess() as AccessCollection | null)?.features || []) as AccessFeature[];
	const pointFeatures = () =>
		accessFeatures().filter((feature) => feature.geometry?.type === 'Point');

	function replaceFeatures(features: AccessFeature[]) {
		state.replaceAccessFeatures(features);
	}

	function cleanup() {
		if (detectionRescanTimeout) clearTimeout(detectionRescanTimeout);
		if (hoverMarker) hoverMarker.remove();
		pointMarkers.forEach(({ marker }) => marker.remove());
		pointMarkers = [];
	}

	function clearDetectedAssets() {
		detectedAssets = [];
		isDetectionLoading = false;
		isDetectionZoomLimited = false;
		if (hoverMarker) hoverMarker.remove();
	}

	function scanNearbyAssets(filterType: DetectableAccessKind | null = null) {
		const map = getMap();
		if (!map || !getIsMapLoaded()) return;
		isDetectionLoading = !map.isSourceLoaded('maptiler_planet');
		const coords = $state.snapshot(
			getGeometryCenter(state.getActiveEntry()?.geometry) || [0, 0]
		) as Coordinates;
		const features = map.querySourceFeatures('maptiler_planet', { sourceLayer: 'poi' });
		isDetectionZoomLimited = !isDetectionLoading && map.getZoom() <= 16 && features.length === 0;
		const suggestions: DetectedAsset[] = [];
		const seen = new Set();
		features.forEach((feature) => {
			const props = feature.properties;
			const cls = props.class || '';
			const sub = props.subclass || '';
			const coordinates =
				feature.geometry.type === 'Point'
					? feature.geometry.coordinates
					: turf.centroid(feature).geometry.coordinates;
			const pointCoordinates = coordinates as Coordinates;
			const key = `${props.name || 'unnamed'}-${pointCoordinates[0].toFixed(4)},${pointCoordinates[1].toFixed(4)}`;
			if (seen.has(key)) return;
			seen.add(key);

			let kind: Exclude<AccessKind, 'approach'> | null = null;
			let mode: TransitMode | null = null;
			if (cls === 'parking' || sub === 'parking') kind = 'parking';
			else if (
				['bus', 'bus_stop', 'transit'].includes(cls) ||
				['bus_stop', 'bus_station', 'transit'].includes(sub)
			) {
				kind = 'transit';
				mode = 'bus';
			} else if (
				['railway', 'station', 'subway'].includes(cls) ||
				['station', 'halt'].includes(sub)
			) {
				kind = 'transit';
				mode = 'train';
			} else if (
				['lodging', 'hotel', 'hut', 'cabin'].includes(cls) ||
				['alpine_hut', 'hut', 'cabin', 'guesthouse', 'hostel'].includes(sub)
			) {
				kind = 'hut';
			}
			if (!kind || (filterType && kind !== filterType)) return;
			const distance = turf.distance(turf.point(coords), turf.point(pointCoordinates)) * 1000;
			if (distance > 15000) return;
			const exists = pointFeatures().some(
				(item) =>
					turf.distance(turf.point(item.geometry.coordinates), turf.point(pointCoordinates)) < 0.01
			);
			if (!exists)
				suggestions.push({
					id: createAccessId('suggestion'),
					name:
						props.name ||
						(kind === 'parking' ? 'Parking Area' : kind === 'hut' ? 'Mountain Hut' : 'Station'),
					kind,
					mode,
					coordinates: pointCoordinates,
					distance
				});
		});
		detectedAssets = suggestions.sort((a, b) => a.distance - b.distance).slice(0, 100);
	}

	function startNearbyAssetScan(filterType: Exclude<AccessKind, 'approach'> | null = null) {
		isDetectionLoading = true;
		scanNearbyAssets(filterType);
	}

	function scheduleNearbyAssetScan() {
		const tool = getActiveTool();
		if (!isDetectableAccessKind(tool)) return;
		if (detectionRescanTimeout) return;

		// Source-data events can arrive in bursts while a vector tile is decoded.
		// Scan once after the current burst, when querySourceFeatures can see the POIs.
		detectionRescanTimeout = setTimeout(() => {
			detectionRescanTimeout = null;
			if (getActiveTool() === tool) scanNearbyAssets(tool);
		}, 0);
	}

	function initDetectionPointHandlers() {
		const map = getMap();
		if (!map || areDetectionPointHandlersReady) return;
		areDetectionPointHandlersReady = true;
		map.on('mousemove', (event) => {
			if (!map.getLayer('detection-points') || detectedAssets.length === 0) return;
			const radius = getMapHitRadius(8);
			const features = map.queryRenderedFeatures(
				[
					[event.point.x - radius, event.point.y - radius],
					[event.point.x + radius, event.point.y + radius]
				],
				{ layers: ['detection-points'] }
			);
			map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
		});
		map.on('mouseleave', () => {
			if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
		});
		map.on('sourcedata', (event) => {
			if (event.sourceId === 'maptiler_planet') scheduleNearbyAssetScan();
		});
		map.on('moveend', scheduleNearbyAssetScan);
	}

	function syncDetectionHighlights() {
		const source = getMap()?.getSource('detection-highlights') as GeoJSONSource | undefined;
		if (!source) return;
		source.setData({
			type: 'FeatureCollection',
			features: detectedAssets.map((asset) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: asset.coordinates },
				properties: { kind: asset.kind, id: asset.id }
			}))
		});
	}

	function setHoverHighlight(asset: DetectedAsset | null) {
		const map = getMap();
		if (!map) return;
		if (hoverMarker) hoverMarker.remove();
		if (!asset) return;
		const el = document.createElement('div');
		el.className = 'hover-ghost-marker pointer-events-none';
		el.style.cssText =
			'width:44px;height:44px;border-radius:50%;border:4px solid #0075de;background:rgba(0,117,222,.2);box-shadow:0 0 15px rgba(0,117,222,.3)';
		const icon =
			asset.kind === 'parking'
				? 'fa-square-parking'
				: asset.kind === 'hut'
					? 'fa-house'
					: asset.mode === 'train'
						? 'fa-train'
						: 'fa-bus';
		el.innerHTML = `<div class="w-full h-full flex items-center justify-center text-creator-blue"><i class="fa-solid ${icon} text-xl"></i></div>`;
		hoverMarker = new maplibregl.Marker({ element: el }).setLngLat(asset.coordinates).addTo(map);
		map.easeTo({ center: asset.coordinates, duration: 400 });
	}

	function addAccessPoint(
		kind: Exclude<AccessKind, 'approach'>,
		coordinates: Coordinates,
		properties: { name?: string; mode?: TransitMode } = {}
	) {
		const feature = {
			type: 'Feature',
			id: createAccessId(kind),
			geometry: { type: 'Point', coordinates },
			properties: { ...properties, kind }
		} as AccessFeature;
		replaceFeatures([...accessFeatures(), feature]);
		createPointMarker(feature);
		return feature.id;
	}

	function addDetectedAsset(asset: DetectedAsset) {
		if (hoverMarker) hoverMarker.remove();
		addAccessPoint(asset.kind, asset.coordinates, {
			name: asset.name,
			...(asset.mode ? { mode: asset.mode } : {})
		});
		detectedAssets = detectedAssets.filter((item) => item.id !== asset.id);
	}

	function addTransitPoint(coordinates: Coordinates) {
		return addAccessPoint('transit', coordinates, { name: 'New Station', mode: 'bus' });
	}
	function addParkingPoint(coordinates: Coordinates) {
		return addAccessPoint('parking', coordinates);
	}
	function addHutPoint(coordinates: Coordinates) {
		return addAccessPoint('hut', coordinates, { name: 'Mountain Hut' });
	}

	function createPointMarker(feature: AccessFeature) {
		const map = getMap();
		if (!map) return;
		const kind = feature.properties.kind;
		const iconName = kind === 'parking' ? 'parking' : feature.properties.mode || 'bus';
		const marker = new maplibregl.Marker({
			element: createIconMarkerElement({
				className: `${kind}-marker cursor-move`,
				iconUrl: kind === 'hut' ? undefined : `${base}/icons/${iconName}.png`,
				iconClass: kind === 'hut' ? 'fa-solid fa-house' : null,
				size: getMapMarkerSize(24)
			}),
			draggable: true
		})
			.setLngLat(feature.geometry.coordinates)
			.addTo(map);
		marker.on('dragend', () => {
			const pos = marker.getLngLat();
			const coordinates: Coordinates = [pos.lng, pos.lat];
			if (accessFeatures().some((candidate) => candidate.id === feature.id)) {
				replaceFeatures(
					accessFeatures().map((item) =>
						item.id === feature.id ? { ...item, geometry: { ...item.geometry, coordinates } } : item
					)
				);
			}
		});
		pointMarkers.push({ id: feature.id, marker });
	}

	function syncAccessMarkers() {
		pointMarkers.forEach(({ marker }) => marker.remove());
		pointMarkers = [];
		pointFeatures().forEach(createPointMarker);
	}

	function removeAccessFeature(id: string) {
		replaceFeatures(accessFeatures().filter((feature) => feature.id !== id));
		const item = pointMarkers.find((marker) => marker.id === id);
		if (item) item.marker.remove();
		pointMarkers = pointMarkers.filter((marker) => marker.id !== id);
	}

	function scanForActiveTool() {
		const tool = getActiveTool();
		if (tool === 'parking' || tool === 'transit' || tool === 'hut') scanNearbyAssets(tool);
		else clearDetectedAssets();
	}

	return {
		get detectedAssets() {
			return detectedAssets;
		},
		get isDetectionLoading() {
			return isDetectionLoading;
		},
		get isDetectionZoomLimited() {
			return isDetectionZoomLimited;
		},
		scanNearbyAssets,
		startNearbyAssetScan,
		scanForActiveTool,
		clearDetectedAssets,
		initDetectionPointHandlers,
		syncDetectionHighlights,
		setHoverHighlight,
		addDetectedAsset,
		addTransitPoint,
		addParkingPoint,
		addHutPoint,
		createPointMarker,
		syncAccessMarkers,
		removeAccessFeature,
		cleanup
	};
}
