import maplibregl from 'maplibre-gl';
import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';
import {
	insertGeometryVertex,
	moveGeometryVertex,
	removeGeometryVertex
} from '$lib/assets/js/geometry-path-adapters.js';

export function useCragSectorMapEditor({
	getMap,
	getActiveTool,
	setActiveTool,
	setActiveTab,
	getSelectedSectorId,
	setSelectedSectorId,
	setSuppressNextMapClick,
	onUpdateSectorCoordinates
}) {
	let sectorMarkers = $state([]);
	let selectedSectorVertex = $state(null);
	let vertexDeleteUndo = $state(null);
	let draggingSectorVertex = null;
	let draggingSectorMarkerId = $state(null);
	let vertexDeleteUndoTimer = null;
	let areSectorEditHandlersReady = false;

	function cleanup() {
		clearTimeout(vertexDeleteUndoTimer);
		sectorMarkers.forEach((item) => item.marker.remove());
		sectorMarkers = [];
	}

	function initSectorEditHandlers() {
		const map = getMap();
		if (!map || areSectorEditHandlersReady) return;
		areSectorEditHandlersReady = true;
		map.dragRotate?.disable();
		map.touchZoomRotate?.disableRotation();

		map.on('click', 'sector-polygons-fill', (e) => {
			const sectorId = e.features?.[0]?.properties?.id;
			if (!sectorId) return;
			setSuppressNextMapClick(true);
			setSelectedSectorId(sectorId);
			selectedSectorVertex = null;
			setActiveTab('sectors');
			setActiveTool('position');
		});
		map.on('mouseenter', 'sector-polygons-fill', () => {
			if (getActiveTool() === 'position') map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-polygons-fill', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertices', () => {
			if (getActiveTool() === 'position') map.getCanvas().style.cursor = 'move';
		});
		map.on('mouseleave', 'sector-vertices', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-midpoints', () => {
			if (getActiveTool() === 'position') map.getCanvas().style.cursor = 'copy';
		});
		map.on('mouseleave', 'sector-vertex-midpoints', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('mouseenter', 'sector-vertex-delete', () => {
			if (getActiveTool() === 'position') map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'sector-vertex-delete', () => {
			if (!draggingSectorVertex) map.getCanvas().style.cursor = '';
		});
		map.on('click', 'sector-vertex-delete', deleteSelectedSectorVertex);
		map.on('touchstart', 'sector-vertex-delete', deleteSelectedSectorVertex);
		map.on('mousedown', 'sector-vertices', startSectorVertexDrag);
		map.on('touchstart', 'sector-vertices', startSectorVertexDrag);
		map.on('mousedown', 'sector-vertex-midpoints', startSectorMidpointDrag);
		map.on('touchstart', 'sector-vertex-midpoints', startSectorMidpointDrag);
		map.on('mousemove', moveSectorVertexDrag);
		map.on('touchmove', moveSectorVertexDrag);
		map.on('mouseup', endSectorVertexDrag);
		map.on('touchend', endSectorVertexDrag);
		map.on('touchcancel', endSectorVertexDrag);
	}

	function getMapEventLngLat(event) {
		const lngLat = event?.lngLat || event?.lngLats?.[0];
		if (!lngLat) return null;
		return [lngLat.lng, lngLat.lat];
	}

	function updateSectorGeometry(id, updater) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => {
			if (sector.id !== id) return sector;
			return { ...sector, geometry: updater(sector.geometry) };
		});
	}

	function startSectorVertexDrag(event) {
		const map = getMap();
		if (getActiveTool() !== 'position') return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const vertexIndex = Number(properties.vertexIndex);
		if (!sectorId || !Number.isInteger(vertexIndex)) return;
		event.preventDefault();
		event.originalEvent?.stopPropagation?.();
		setSelectedSectorId(sectorId);
		selectedSectorVertex = { sectorId, vertexIndex };
		draggingSectorVertex = { sectorId, vertexIndex };
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		map.dragRotate?.disable();
		map.getCanvas().style.cursor = 'move';
	}

	function startSectorMidpointDrag(event) {
		const map = getMap();
		if (getActiveTool() !== 'position') return;
		const lngLat = getMapEventLngLat(event);
		if (!lngLat) return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const insertIndex = Number(properties.insertIndex);
		if (!sectorId || !Number.isInteger(insertIndex)) return;
		event.preventDefault();
		event.originalEvent?.stopPropagation?.();
		setSelectedSectorId(sectorId);
		selectedSectorVertex = { sectorId, vertexIndex: insertIndex };
		updateSectorGeometry(sectorId, (geometry) =>
			insertGeometryVertex(geometry, insertIndex, lngLat)
		);
		draggingSectorVertex = { sectorId, vertexIndex: insertIndex };
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		map.dragRotate?.disable();
		map.getCanvas().style.cursor = 'move';
	}

	function moveSectorVertexDrag(event) {
		if (!draggingSectorVertex) return;
		const lngLat = getMapEventLngLat(event);
		if (!lngLat) return;
		event.preventDefault();
		event.originalEvent?.stopPropagation?.();
		updateSectorGeometry(draggingSectorVertex.sectorId, (geometry) =>
			moveGeometryVertex(geometry, draggingSectorVertex.vertexIndex, lngLat)
		);
	}

	function endSectorVertexDrag() {
		const map = getMap();
		if (!draggingSectorVertex) return;
		draggingSectorVertex = null;
		setSuppressNextMapClick(true);
		map.dragPan.enable();
		map.touchZoomRotate.enable();
		map.touchZoomRotate?.disableRotation();
		map.getCanvas().style.cursor = '';
	}

	function cloneGeometry(geometry) {
		return geometry ? JSON.parse(JSON.stringify(geometry)) : geometry;
	}

	function deleteSelectedSectorVertex(event) {
		if (getActiveTool() !== 'position') return;
		const properties = event.features?.[0]?.properties || {};
		const sectorId = properties.sectorId;
		const vertexIndex = Number(properties.vertexIndex);
		if (!sectorId || !Number.isInteger(vertexIndex)) return;
		event.preventDefault();
		setSuppressNextMapClick(true);
		setSelectedSectorId(sectorId);
		selectedSectorVertex = null;
		const sector = (cragEditorState.crag.sectors || []).find((item) => item.id === sectorId);
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
		setSelectedSectorId(sectorId);
		selectedSectorVertex = null;
		vertexDeleteUndo = null;
		clearTimeout(vertexDeleteUndoTimer);
	}

	function syncSectorMarkers() {
		const map = getMap();
		if (!map) return;
		sectorMarkers.forEach((item) => item.marker.remove());
		sectorMarkers = [];
		(cragEditorState.crag.sectors || []).forEach((sector) => {
			const coordinates = getGeometryCenter(sector.geometry);
			if (!Array.isArray(coordinates) || coordinates.length < 2) return;
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `sector-marker ${getSelectedSectorId() === sector.id ? 'is-selected' : ''}`;
			el.title = sector.name || sector.id || 'Sector';
			el.innerHTML = `<span>${sector.id || 'S'}</span>`;
			el.addEventListener('click', (event) => {
				event.stopPropagation();
				setSelectedSectorId(sector.id);
				setActiveTab('sectors');
				setActiveTool('position');
			});
			const marker = new maplibregl.Marker({ element: el, draggable: true })
				.setLngLat(coordinates)
				.addTo(map);
			marker.on('dragstart', () => {
				draggingSectorMarkerId = sector.id;
				setSelectedSectorId(sector.id);
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
		initSectorEditHandlers,
		syncSectorMarkers,
		undoSectorVertexDelete,
		cleanup
	};
}
