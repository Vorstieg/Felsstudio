import maplibregl from 'maplibre-gl';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';
import { getEditablePath, getPathMidpoints } from '$lib/assets/js/path-geometry.js';
import {
	getGeometryPath,
	insertGeometryVertex,
	moveGeometryVertex,
	removeGeometryVertex
} from '$lib/assets/js/geometry-path-adapters.js';
import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';

export function useCragSectorMapEditor({
	state,
	getMap,
	getActiveTool,
	setActiveTool,
	setActiveTab,
	getSelectedObject,
	setSelectedObject,
	setSuppressNextMapClick,
	onUpdateSectorCoordinates,
	onCommitSectorGeometry = () => {}
}) {
	let sectorMarkers = $state([]);
	let selectedSectorVertex = $state(null);
	let vertexDeleteUndo = $state(null);
	let draggingSectorVertex = null;
	let draggingSectorGeometry = null;
	let draggingSectorMarkerId = $state(null);
	let vertexDeleteUndoTimer = null;
	let areSectorEditHandlersReady = false;

	function selectSector(id) {
		setSelectedObject(id ? { type: 'sector', id } : null);
	}

	function isSelectedSector(id) {
		const selection = getSelectedObject();
		return selection?.type === 'sector' && selection.id === id;
	}

	function cleanup() {
		clearTimeout(vertexDeleteUndoTimer);
		sectorMarkers.forEach((item) => item.marker.remove());
		sectorMarkers = [];
		clearSectorDragPreview();
	}

	function setSectorDragPreview(geometry) {
		const source = getMap()?.getSource('sector-drag-overlay');
		if (!source || geometry?.type !== 'Polygon') return;
		const path = getGeometryPath(geometry);
		const features = [{ type: 'Feature', properties: {}, geometry }];
		getEditablePath(path, { closed: true }).forEach((point, vertexIndex) => {
			features.push({
				type: 'Feature',
				properties: { feature: 'sector-vertex', vertexIndex },
				geometry: { type: 'Point', coordinates: point }
			});
		});
		getPathMidpoints(path, { closed: true }).forEach((midpoint) => {
			features.push({
				type: 'Feature',
				properties: { feature: 'sector-midpoint', insertIndex: midpoint.insertIndex },
				geometry: { type: 'Point', coordinates: midpoint.point }
			});
		});
		const draggedVertex = draggingSectorVertex?.vertexIndex;
		if (draggedVertex !== undefined && getEditablePath(path, { closed: true }).length > 3) {
			features.push({
				type: 'Feature',
				properties: { feature: 'sector-vertex-delete', vertexIndex: draggedVertex },
				geometry: {
					type: 'Point',
					coordinates: getEditablePath(path, { closed: true })[draggedVertex]
				}
			});
		}
		source.setData({
			type: 'FeatureCollection',
			features
		});
	}

	function clearSectorDragPreview() {
		getMap()?.getSource('sector-drag-overlay')?.setData({
			type: 'FeatureCollection',
			features: []
		});
	}

	function initSectorEditHandlers() {
		const map = getMap();
		if (!map || areSectorEditHandlersReady) return;
		areSectorEditHandlersReady = true;
		map.touchZoomRotate?.disableRotation();

		map.on('click', 'sector-polygons-fill', (e) => {
			const sectorId = e.features?.[0]?.properties?.id;
			if (!sectorId) return;
			setSuppressNextMapClick(true);
			selectSector(sectorId);
			selectedSectorVertex = null;
			setActiveTab('sectors');
		});
		map.on('mouseenter', 'sector-polygons-fill', () => {
			if (['select', 'position'].includes(getActiveTool()))
				map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-polygons-fill', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertices', () => {
			if (['select', 'position'].includes(getActiveTool())) map.getCanvas().style.cursor = 'move';
		});
		map.on('mouseleave', 'sector-vertices', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-midpoints', () => {
			if (['select', 'position'].includes(getActiveTool())) map.getCanvas().style.cursor = 'copy';
		});
		map.on('mouseleave', 'sector-vertex-midpoints', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-delete', () => {
			if (['select', 'position'].includes(getActiveTool()))
				map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-vertex-delete', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('click', 'sector-vertex-delete', deleteSelectedSectorVertex);
		map.on('touchstart', 'sector-vertex-delete', deleteSelectedSectorVertex);
		initMapPointDragHandlers({
			map,
			layers: ['sector-vertices', 'sector-vertex-midpoints'],
			canDrag: () => ['select', 'position'].includes(getActiveTool()),
			getDragState: (event, layerId) => {
				const properties = event.features?.[0]?.properties || {};
				const sectorId = properties.sectorId;
				const vertexIndex = Number(
					layerId === 'sector-vertex-midpoints' ? properties.insertIndex : properties.vertexIndex
				);
				if (!sectorId || !Number.isInteger(vertexIndex)) return null;
				return { sectorId, vertexIndex, isMidpoint: layerId === 'sector-vertex-midpoints' };
			},
			onDragStart: (drag, event) => {
				const lngLat = getMapEventLngLat(event);
				if (drag.isMidpoint && !lngLat) return false;
				const sector = (state.crag.sectors || []).find(
					(item) => item.id === drag.sectorId
				);
				if (!sector?.geometry) return false;
				selectSector(drag.sectorId);
				selectedSectorVertex = { sectorId: drag.sectorId, vertexIndex: drag.vertexIndex };
				draggingSectorGeometry = drag.isMidpoint
					? insertGeometryVertex(sector.geometry, drag.vertexIndex, lngLat)
					: sector.geometry;
				draggingSectorVertex = drag;
				setSectorDragPreview(draggingSectorGeometry);
				map.dragRotate?.disable();
			},
			onDragMove: (drag, event) => {
				const lngLat = getMapEventLngLat(event);
				if (!lngLat) return;
				if (!draggingSectorGeometry) return;
				draggingSectorGeometry = moveGeometryVertex(
					draggingSectorGeometry,
					drag.vertexIndex,
					lngLat
				);
				setSectorDragPreview(draggingSectorGeometry);
			},
			onDragEnd: () => {
				if (draggingSectorVertex && draggingSectorGeometry) {
					onCommitSectorGeometry(draggingSectorVertex.sectorId, draggingSectorGeometry);
				}
				draggingSectorGeometry = null;
				clearSectorDragPreview();
				draggingSectorVertex = null;
				setSuppressNextMapClick(true);
				map.dragRotate?.enable();
				map.touchZoomRotate?.disableRotation();
			}
		});
	}

	function getMapEventLngLat(event) {
		const lngLat = event?.lngLat || event?.lngLats?.[0];
		if (!lngLat) return null;
		return [lngLat.lng, lngLat.lat];
	}

	function updateSectorGeometry(id, updater) {
		const sector = (state.crag.sectors || []).find((item) => item.id === id);
		if (sector) onCommitSectorGeometry(id, updater(sector.geometry));
	}

	function cloneGeometry(geometry) {
		return geometry ? JSON.parse(JSON.stringify(geometry)) : geometry;
	}

	function deleteSelectedSectorVertex(event) {
		if (!['select', 'position'].includes(getActiveTool())) return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const vertexIndex = Number(properties.vertexIndex);
		if (!sectorId || !Number.isInteger(vertexIndex)) return;
		setSuppressNextMapClick(true);
		selectSector(sectorId);
		selectedSectorVertex = null;
		const sector = (state.crag.sectors || []).find((item) => item.id === sectorId);
		if (!sector?.geometry) return;
		vertexDeleteUndo = { sectorId, geometry: cloneGeometry(sector.geometry) };
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
		selectSector(sectorId);
		selectedSectorVertex = null;
		vertexDeleteUndo = null;
		clearTimeout(vertexDeleteUndoTimer);
	}

	function syncSectorMarkers() {
		const map = getMap();
		if (!map) return;
		sectorMarkers.forEach((item) => item.marker.remove());
		sectorMarkers = [];
		(state.crag.sectors || []).forEach((sector) => {
			const coordinates = getGeometryCenter(sector.geometry);
			if (!Array.isArray(coordinates) || coordinates.length < 2) return;
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `sector-marker ${isSelectedSector(sector.id) ? 'is-selected' : ''}`;
			el.title = sector.name || sector.id || 'Sector';
			el.innerHTML = `<span>${sector.id || 'S'}</span>`;
			el.addEventListener('click', (event) => {
				event.stopPropagation();
				selectSector(sector.id);
				setActiveTab('sectors');
			});
			const marker = new maplibregl.Marker({ element: el, draggable: true })
				.setLngLat(coordinates)
				.addTo(map);
			marker.on('dragstart', () => {
				draggingSectorMarkerId = sector.id;
				selectSector(sector.id);
				setActiveTab('sectors');
			});
			marker.on('drag', () => {
				const pos = marker.getLngLat();
				onUpdateSectorCoordinates(sector.id, [pos.lng, pos.lat]);
			});
			marker.on('dragend', () => {
				const pos = marker.getLngLat();
				onUpdateSectorCoordinates(sector.id, [pos.lng, pos.lat]);
				draggingSectorMarkerId = null;
				setSuppressNextMapClick(true);
			});
			sectorMarkers.push({ id: sector.id, marker });
		});
	}

	return {
		get selectedSectorVertex() {
			return selectedSectorVertex;
		},
		get vertexDeleteUndo() {
			return vertexDeleteUndo;
		},
		get draggingSectorMarkerId() {
			return draggingSectorMarkerId;
		},
		get draggingSectorVertex() {
			return draggingSectorVertex;
		},
		initSectorEditHandlers,
		syncSectorMarkers,
		undoSectorVertexDelete,
		cleanup
	};
}
