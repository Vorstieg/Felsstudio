import {
	createPolygonAround,
	getGeometryCenter,
	translateGeometryTo
} from '$lib/assets/js/sector-utils.js';
import { getGeometryPath } from '$lib/assets/js/geometry-path-adapters.js';
import { getEditablePath, getPathMidpoints } from '$lib/assets/js/path-geometry.js';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';
import {
	addSector,
	createDefaultSector,
	duplicateSectorById,
	moveSectorById,
	removeSectorById
} from './crag-editor-sectors.js';

/** Core sector mutations and selection/focus workflows for the crag editor. */
export function createCragSectorTool({
	state,
	getMap,
	getSelection,
	selectObject,
	setActiveTool,
	setActiveTab
} = {}) {
	function ensureMapLayers(map = getMap()) {
		if (!map) return;
		const midpointRadius = getTouchTargetSize(5);
		const vertexRadius = getTouchTargetSize(7);
		const deleteTextSize = getTouchTargetSize(17);
		if (!map.getSource('sector-editor-data'))
			map.addSource('sector-editor-data', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		if (!map.getSource('sector-drag-overlay'))
			map.addSource('sector-drag-overlay', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		const layers = [
			{
				id: 'sector-polygons-fill',
				type: 'fill',
				filter: ['==', ['get', 'feature'], 'sector'],
				paint: {
					'fill-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.22, 0.12]
				}
			},
			{
				id: 'sector-polygons-outline',
				type: 'line',
				filter: ['==', ['get', 'feature'], 'sector'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: {
					'line-color': ['case', ['==', ['get', 'selected'], true], '#0075de', '#31302e'],
					'line-width': ['case', ['==', ['get', 'selected'], true], 3, 2],
					'line-opacity': 0.9
				}
			},
			{
				id: 'sector-vertex-midpoints',
				type: 'circle',
				filter: ['==', ['get', 'feature'], 'sector-midpoint'],
				paint: {
					'circle-radius': midpointRadius,
					'circle-color': '#ffffff',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#0075de',
					'circle-opacity': 0.85
				}
			},
			{
				id: 'sector-vertices',
				type: 'circle',
				filter: ['==', ['get', 'feature'], 'sector-vertex'],
				paint: {
					'circle-radius': vertexRadius,
					'circle-color': '#0075de',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			},
			{
				id: 'sector-vertex-delete',
				type: 'symbol',
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
			}
		];
		for (const layer of layers)
			if (!map.getLayer(layer.id)) {
				const before = map.getLayer('tracks-line-saved') ? 'tracks-line-saved' : undefined;
				map.addLayer({ ...layer, source: 'sector-editor-data' }, before);
			}
		const dragLayers = [
			{
				id: 'sector-drag-fill',
				type: 'fill',
				paint: { 'fill-color': '#0075de', 'fill-opacity': 0.22 }
			},
			{
				id: 'sector-drag-line',
				type: 'line',
				paint: { 'line-color': '#0075de', 'line-width': 3, 'line-opacity': 1 }
			},
			{
				id: 'sector-drag-vertices',
				type: 'circle',
				filter: ['==', ['get', 'feature'], 'sector-vertex'],
				paint: {
					'circle-radius': vertexRadius,
					'circle-color': '#0075de',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#ffffff'
				}
			},
			{
				id: 'sector-drag-midpoints',
				type: 'circle',
				filter: ['==', ['get', 'feature'], 'sector-midpoint'],
				paint: {
					'circle-radius': midpointRadius,
					'circle-color': '#ffffff',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#0075de',
					'circle-opacity': 0.85
				}
			},
			{
				id: 'sector-drag-delete',
				type: 'symbol',
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
			}
		];
		for (const layer of dragLayers)
			if (!map.getLayer(layer.id)) map.addLayer({ ...layer, source: 'sector-drag-overlay' });
	}

	function syncDrawing({ selectedSectorVertex = null, draggingSectorVertex = null } = {}) {
		const map = getMap();
		if (!map) return;
		ensureMapLayers(map);
		const features = [];
		(state.crag.sectors || []).forEach((sector) => {
			if (sector.geometry?.type !== 'Polygon' || draggingSectorVertex?.sectorId === sector.id)
				return;
			const selected = getSelection()?.type === 'sector' && getSelection().id === sector.id;
			features.push({
				type: 'Feature',
				geometry: sector.geometry,
				properties: {
					feature: 'sector',
					id: sector.id || '',
					name: sector.name || '',
					selected
				}
			});
			if (!selected) return;
			const path = getGeometryPath(sector.geometry);
			const editablePath = getEditablePath(path, { closed: true });
			editablePath.forEach((point, vertexIndex) => {
				if (
					draggingSectorVertex?.sectorId === sector.id &&
					draggingSectorVertex.vertexIndex === vertexIndex
				)
					return;
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: point },
					properties: { feature: 'sector-vertex', sectorId: sector.id, vertexIndex }
				});
				if (
					selectedSectorVertex?.sectorId === sector.id &&
					selectedSectorVertex.vertexIndex === vertexIndex &&
					editablePath.length > 3
				)
					features.push({
						type: 'Feature',
						geometry: { type: 'Point', coordinates: point },
						properties: { feature: 'sector-vertex-delete', sectorId: sector.id, vertexIndex }
					});
			});
			getPathMidpoints(path, { closed: true }).forEach((midpoint) => {
				if (
					draggingSectorVertex?.sectorId === sector.id &&
					[draggingSectorVertex.vertexIndex, draggingSectorVertex.vertexIndex + 1].includes(
						midpoint.insertIndex
					)
				)
					return;
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
		map.getSource('sector-editor-data')?.setData({ type: 'FeatureCollection', features });
	}
	function focusSector(sector) {
		selectObject({ type: 'sector', id: sector.id });
		setActiveTool('position');
		const center = getGeometryCenter(sector.geometry);
		const map = getMap();
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function createSector() {
		const sectors = state.crag.sectors || [];
		const sector = createDefaultSector({
			sectors,
			cragCoordinates: state.crag.geometry.coordinates
		});
		state.setSectors(addSector(sectors, sector));
		selectObject({ type: 'sector', id: sector.id });
		setActiveTab('sectors');
		setActiveTool('position');
	}

	function duplicateSector(id) {
		const result = duplicateSectorById(state.crag.sectors || [], id);
		if (!result.duplicatedId) return;
		state.setSectors(result.sectors);
		selectObject({ type: 'sector', id: result.duplicatedId });
		setActiveTab('sectors');
	}

	function removeSector(id) {
		state.setSectors(removeSectorById(state.crag.sectors || [], id));
		const selection = getSelection?.();
		if (selection?.type === 'sector' && selection.id === id) selectObject(null);
	}

	function moveSector(id, direction) {
		state.setSectors(moveSectorById(state.crag.sectors || [], id, direction));
	}

	function setSectorGeometryType(id, type) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) => {
				if (sector.id !== id || sector.geometry?.type === type) return sector;
				const center = getGeometryCenter(sector.geometry) ||
					state.crag.geometry?.coordinates || [0, 0];
				return {
					...sector,
					geometry:
						type === 'Polygon'
							? createPolygonAround(center)
							: { type: 'Point', coordinates: [...center] }
				};
			})
		);
	}

	function updateSectorCoordinates(id, coordinates) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) =>
				sector.id !== id
					? sector
					: {
							...sector,
							geometry: translateGeometryTo(
								sector.geometry || { type: 'Point', coordinates },
								coordinates
							)
						}
			)
		);
	}

	function updateSectorGeometry(id, updater) {
		state.setSectors(
			(state.crag.sectors || []).map((sector) =>
				sector.id === id ? { ...sector, geometry: updater(sector.geometry) } : sector
			)
		);
	}

	return {
		ensureMapLayers,
		syncDrawing,
		focusSector,
		createSector,
		duplicateSector,
		removeSector,
		moveSector,
		setSectorGeometryType,
		updateSectorCoordinates,
		updateSectorGeometry
	};
}
