import { getGeometryPath } from '$lib/assets/js/geometry-path-adapters.js';
import { getEditablePath, getPathMidpoints } from '$lib/assets/js/path-geometry.js';
import { getMapHitRadius, getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';

export function createIconMarkerElement({ className, iconUrl, size = 24 }) {
	const el = document.createElement('div');
	el.className = className;
	el.style.width = `${size}px`;
	el.style.height = `${size}px`;
	el.style.backgroundImage = `url(${iconUrl})`;
	el.style.backgroundSize = 'cover';
	return el;
}

export function ensureCragEditorLayers(map) {
	const detectionRadius = getMapHitRadius(12);
	const drawingPointRadius = getTouchTargetSize(5);
	const midpointRadius = getTouchTargetSize(5);
	const vertexRadius = getTouchTargetSize(7);
	const deleteTextSize = getTouchTargetSize(17);

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
				'circle-radius': detectionRadius,
				'circle-color': '#0075de',
				'circle-opacity': 0.3,
				'circle-stroke-width': 2,
				'circle-stroke-color': '#0075de',
				'circle-stroke-opacity': 0.7
			}
		});

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
	if (!map.getLayer('routes-line'))
		map.addLayer({
			id: 'routes-line',
			type: 'line',
			source: 'crag-editor-data',
			filter: ['==', ['get', 'feature'], 'route'],
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
				'line-width': ['case', ['==', ['get', 'selected'], true], 6, 4],
				'line-opacity': 0.9
			}
		});
	if (!map.getLayer('tracks-points-drawing'))
		map.addLayer({
			id: 'tracks-points-drawing',
			type: 'circle',
			source: 'crag-editor-data',
			filter: ['all', ['==', ['get', 'type'], 'Point'], ['==', ['get', 'state'], 'drawing']],
			paint: {
				'circle-radius': drawingPointRadius,
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
				'circle-radius': midpointRadius,
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
				'circle-radius': vertexRadius,
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
				'text-size': deleteTextSize,
				'text-offset': [0.85, -0.85],
				'text-allow-overlap': true,
				'text-ignore-placement': true
			},
			paint: { 'text-color': '#ffffff', 'text-halo-color': '#dc2626', 'text-halo-width': 6 }
		});
}

export function buildEditorFeatureCollection({
	sectors = [],
	savedTracks = [],
	routes = [],
	selectedRouteKey = null,
	drawingPoints = [],
	selectedSectorId = null,
	selectedSectorVertex = null,
	editingTrackIndex = null
}) {
	const features = [];
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
			if (isSelectedVertex && editablePath.length > 3)
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: point },
					properties: { feature: 'sector-vertex-delete', sectorId: sector.id, vertexIndex }
				});
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
	savedTracks.forEach((track, index) => {
		if (editingTrackIndex === index || !(track.coordinates?.length > 1)) return;
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: track.coordinates },
			properties: { name: track.name, state: 'saved', trackIndex: index }
		});
	});
	routes.forEach(({ key, route }) => {
		for (const path of route?.assets?.paths || []) {
			if (path?.path?.type !== 'LineString' || path.path.coordinates?.length < 2) continue;
			features.push({
				type: 'Feature',
				geometry: path.path,
				properties: {
					feature: 'route',
					key,
					name: route.name || 'Unnamed route',
					selected: key === selectedRouteKey
				}
			});
		}
	});
	if (drawingPoints.length > 1)
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: drawingPoints },
			properties: { name: 'Drawing', state: 'drawing' }
		});
	drawingPoints.forEach((point, pointIndex) =>
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: point },
			properties: { type: 'Point', state: 'drawing', pointIndex }
		})
	);
	return { type: 'FeatureCollection', features };
}
