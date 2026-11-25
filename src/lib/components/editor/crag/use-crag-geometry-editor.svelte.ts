import type {
	Map as MapLibreMap,
	MapMouseEvent,
	MapLayerMouseEvent,
	MapLayerTouchEvent,
	MapTouchEvent,
	GeoJSONSource,
	LayerSpecification
} from 'maplibre-gl';
import type { Feature, Geometry } from 'geojson';
import type { CragEditorSession, MetadataTarget } from '$lib/types/crag';
import type { Point2D, PointOrAreaGeometry } from '@vorstieg/fels-types/types';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.ts';
import {
	getEditablePath,
	getPathMidpoints,
	insertPathVertex,
	movePathVertex,
	removePathVertex
} from '$lib/assets/js/path-geometry.ts';
import { getGeometryPath, editGeometryPath } from '$lib/assets/js/geometry-path-adapters.ts';
import {
	getGeometryCenter,
	isAreaGeometry,
	translateGeometryTo
} from '$lib/assets/js/sector-utils.ts';
import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.ts';

const SOURCE_ID = 'geometry-editor-data';
const LAYERS = {
	fill: 'geometry-editor-fill',
	line: 'geometry-editor-line',
	displayPoint: 'geometry-editor-display-point',
	point: 'geometry-editor-point',
	center: 'geometry-editor-center',
	vertices: 'geometry-editor-vertices',
	midpoints: 'geometry-editor-midpoints'
};

type GeometryEditorProperties = {
	handle: 'point' | 'display-point' | 'polygon' | 'center' | 'vertex' | 'midpoint';
	polygonIndex?: number;
	vertexIndex?: number;
	insertIndex?: number;
	selected?: boolean;
};
type GeometryEditorFeature = Feature<Geometry, GeometryEditorProperties>;
type SelectedVertexRef = number | { polygonIndex?: number; vertexIndex: number } | null;
type GeometryEditorDrag = {
	target: MetadataTarget | null;
	geometry: PointOrAreaGeometry;
	kind: 'point' | 'center' | 'vertex' | 'midpoint';
	polygonIndex: number;
	vertexIndex: number;
};
type GeometryEditorLayerEvent = MapLayerMouseEvent | MapLayerTouchEvent;
type GeometryEditorEvent = MapLayerMouseEvent | MapLayerTouchEvent | MapMouseEvent | MapTouchEvent;
type GeometryEditorOptions = {
	state: CragEditorSession;
	getMap: () => MapLibreMap | null | undefined;
	getActiveTool: () => string;
	setSuppressNextMapClick?: (suppress: boolean) => void;
};

function targetKey(target: MetadataTarget | null) {
	return target || '';
}

function eventCoordinate(event?: GeometryEditorEvent | null): Point2D | null {
	const lngLat = event?.lngLat;
	return lngLat ? [lngLat.lng, lngLat.lat] : null;
}

export function cloneGeoJsonGeometry<T extends PointOrAreaGeometry | null | undefined>(
	geometry: T
): T {
	return geometry ? (JSON.parse(JSON.stringify(geometry)) as T) : geometry;
}

export function buildGeometryEditorFeatures(
	geometry: PointOrAreaGeometry | null | undefined,
	selectedVertex: SelectedVertexRef = null,
	editable = true
): GeometryEditorFeature[] {
	if (!geometry) return [];
	if (geometry.type === 'Point') {
		return [
			{
				type: 'Feature',
				geometry,
				properties: { handle: editable ? 'point' : 'display-point' }
			} as GeometryEditorFeature
		];
	}
	if (!isAreaGeometry(geometry)) return [];
	const selected =
		typeof selectedVertex === 'number'
			? { polygonIndex: 0, vertexIndex: selectedVertex }
			: selectedVertex
				? {
						polygonIndex: selectedVertex.polygonIndex ?? 0,
						vertexIndex: selectedVertex.vertexIndex
					}
				: null;
	const features: GeometryEditorFeature[] = [
		{ type: 'Feature', geometry, properties: { handle: 'polygon' } } as GeometryEditorFeature
	];
	if (!editable) return features;
	const center = getGeometryCenter(geometry);
	if (center)
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: center },
			properties: { handle: 'center' }
		} as GeometryEditorFeature);
	const multi = geometry as unknown as { type?: string; coordinates?: unknown[][][] };
	const polygonCount =
		multi.type === 'MultiPolygon' && Array.isArray(multi.coordinates)
			? multi.coordinates.length
			: 1;
	for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex += 1) {
		const path = getGeometryPath(geometry, polygonIndex);
		const editablePath = getEditablePath(path, { closed: true });
		for (const [vertexIndex, point] of editablePath.entries()) {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: point },
				properties: {
					handle: 'vertex',
					polygonIndex,
					vertexIndex,
					selected:
						selected !== null &&
						selected.polygonIndex === polygonIndex &&
						selected.vertexIndex === vertexIndex
				}
			} as GeometryEditorFeature);
		}
		for (const midpoint of getPathMidpoints(path, { closed: true })) {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: midpoint.point },
				properties: { handle: 'midpoint', polygonIndex, insertIndex: midpoint.insertIndex }
			} as GeometryEditorFeature);
		}
	}
	return features;
}

export function useCragGeometryEditor({
	state,
	getMap,
	getActiveTool,
	setSuppressNextMapClick = () => {}
}: GeometryEditorOptions) {
	let selectedVertex = $state<{
		targetKey: string;
		polygonIndex: number;
		vertexIndex: number;
	} | null>(null);
	let previewGeometry: PointOrAreaGeometry | null = null;
	let dragState: GeometryEditorDrag | null = null;
	let lastTargetKey = '';
	let handlerMap: MapLibreMap | null = null;
	let cleanupDragHandlers: (() => void) | null = null;
	const mapCleanups: Array<() => void> = [];

	function activeTarget(): MetadataTarget | null {
		return state.activeMetadataTarget;
	}

	function activeGeometry(): PointOrAreaGeometry | null {
		return state.getMetadataTarget(activeTarget())?.geometry || null;
	}

	function ensureMapLayers(map = getMap()) {
		if (!map) return;
		if (!map.getSource(SOURCE_ID))
			map.addSource(SOURCE_ID, {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});
		const vertexRadius = getTouchTargetSize(7);
		const midpointRadius = getTouchTargetSize(5);
		const layers = [
			{
				id: LAYERS.fill,
				type: 'fill',
				filter: ['==', ['get', 'handle'], 'polygon'],
				paint: { 'fill-color': '#0075de', 'fill-opacity': 0.18 }
			},
			{
				id: LAYERS.line,
				type: 'line',
				filter: ['==', ['get', 'handle'], 'polygon'],
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: { 'line-color': '#0075de', 'line-width': 3 }
			},
			{
				id: LAYERS.displayPoint,
				type: 'circle',
				filter: ['==', ['get', 'handle'], 'display-point'],
				paint: {
					'circle-radius': getTouchTargetSize(6),
					'circle-color': '#0075de',
					'circle-opacity': 0.75,
					'circle-stroke-width': 2,
					'circle-stroke-color': '#fff'
				}
			},
			{
				id: LAYERS.midpoints,
				type: 'circle',
				filter: ['==', ['get', 'handle'], 'midpoint'],
				paint: {
					'circle-radius': midpointRadius,
					'circle-color': '#fff',
					'circle-stroke-width': 2,
					'circle-stroke-color': '#0075de',
					'circle-opacity': 0.9
				}
			},
			{
				id: LAYERS.vertices,
				type: 'circle',
				filter: ['==', ['get', 'handle'], 'vertex'],
				paint: {
					'circle-radius': [
						'case',
						['==', ['get', 'selected'], true],
						vertexRadius + 2,
						vertexRadius
					],
					'circle-color': ['case', ['==', ['get', 'selected'], true], '#dc2626', '#0075de'],
					'circle-stroke-width': 2,
					'circle-stroke-color': '#fff'
				}
			},
			{
				id: LAYERS.center,
				type: 'circle',
				filter: ['==', ['get', 'handle'], 'center'],
				paint: {
					'circle-radius': getTouchTargetSize(8),
					'circle-color': '#fff',
					'circle-stroke-width': 3,
					'circle-stroke-color': '#0075de'
				}
			},
			{
				id: LAYERS.point,
				type: 'circle',
				filter: ['==', ['get', 'handle'], 'point'],
				paint: {
					'circle-radius': getTouchTargetSize(9),
					'circle-color': '#0075de',
					'circle-stroke-width': 3,
					'circle-stroke-color': '#fff'
				}
			}
		] as unknown as Array<Omit<LayerSpecification, 'source'>>;
		for (const layer of layers)
			if (!map.getLayer(layer.id))
				map.addLayer({ ...layer, source: SOURCE_ID } as LayerSpecification);
	}

	function syncDrawing() {
		const map = getMap();
		if (!map) return;
		ensureMapLayers(map);
		const key = targetKey(activeTarget());
		if (key !== lastTargetKey) {
			selectedVertex = null;
			previewGeometry = null;
			dragState = null;
			lastTargetKey = key;
		}
		const geometry = previewGeometry || activeGeometry();
		const tool = getActiveTool();
		const features = ['select', 'geometry'].includes(tool)
			? buildGeometryEditorFeatures(geometry, selectedVertex, tool === 'geometry')
			: [];
		(map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData({
			type: 'FeatureCollection',
			features
		});
	}

	function commitPreview() {
		if (!dragState || !previewGeometry) return;
		const labels = {
			point: 'Move point geometry',
			center: 'Translate polygon geometry',
			vertex: 'Move polygon vertex',
			midpoint: 'Insert polygon vertex'
		};
		state.commitGeometry(dragState.target, previewGeometry, labels[dragState.kind]);
	}

	function initHandlers(map = getMap()) {
		if (!map) return;
		ensureMapLayers(map);
		if (handlerMap === map) return;
		cleanup();
		handlerMap = map;

		const selectVertex = (event: MapLayerMouseEvent) => {
			if (getActiveTool() !== 'geometry') return;
			const vertexIndex = Number(event.features?.[0]?.properties?.vertexIndex);
			const rawPolygonIndex = Number(event.features?.[0]?.properties?.polygonIndex);
			const polygonIndex = Number.isInteger(rawPolygonIndex) ? rawPolygonIndex : 0;
			if (!Number.isInteger(vertexIndex)) return;
			selectedVertex = { targetKey: targetKey(activeTarget()), polygonIndex, vertexIndex };
			setSuppressNextMapClick(true);
			syncDrawing();
		};
		map.on('click', LAYERS.vertices, selectVertex);
		mapCleanups.push(() => map.off('click', LAYERS.vertices, selectVertex));

		cleanupDragHandlers = initMapPointDragHandlers({
			map,
			layers: [LAYERS.point, LAYERS.center, LAYERS.vertices, LAYERS.midpoints],
			canDrag: () => getActiveTool() === 'geometry',
			getDragState: (
				event: GeometryEditorLayerEvent,
				layerId: string
			): GeometryEditorDrag | null => {
				const target = activeTarget();
				const geometry = activeGeometry();
				if (!geometry) return null;
				const properties = event.features?.[0]?.properties || {};
				const kind =
					layerId === LAYERS.point
						? 'point'
						: layerId === LAYERS.center
							? 'center'
							: layerId === LAYERS.midpoints
								? 'midpoint'
								: 'vertex';
				const rawPolygonIndex = Number(properties.polygonIndex);
				const polygonIndex = Number.isInteger(rawPolygonIndex) ? rawPolygonIndex : 0;
				const vertexIndex = Number(
					kind === 'midpoint' ? properties.insertIndex : properties.vertexIndex
				);
				if (['vertex', 'midpoint'].includes(kind) && !Number.isInteger(vertexIndex)) return null;
				return {
					target,
					geometry: cloneGeoJsonGeometry(geometry),
					kind,
					polygonIndex,
					vertexIndex
				};
			},
			onDragStart: (drag: GeometryEditorDrag, event: GeometryEditorLayerEvent) => {
				const coordinate = eventCoordinate(event);
				if (!coordinate) return false;
				dragState = drag;
				previewGeometry =
					drag.kind === 'midpoint'
						? editGeometryPath(
								drag.geometry,
								(path, closed) => insertPathVertex(path, drag.vertexIndex, coordinate, { closed }),
								drag.polygonIndex
							)
						: drag.geometry;
				if (drag.kind === 'midpoint' || drag.kind === 'vertex')
					selectedVertex = {
						targetKey: targetKey(drag.target),
						polygonIndex: drag.polygonIndex,
						vertexIndex: drag.vertexIndex
					};
				syncDrawing();
			},
			onDragMove: (drag: GeometryEditorDrag, event: GeometryEditorEvent) => {
				const coordinate = eventCoordinate(event);
				if (!coordinate || !previewGeometry) return;
				previewGeometry =
					drag.kind === 'point' || drag.kind === 'center'
						? translateGeometryTo(drag.geometry, coordinate)
						: editGeometryPath(
								previewGeometry,
								(path, closed) => movePathVertex(path, drag.vertexIndex, coordinate, { closed }),
								drag.polygonIndex
							);
				syncDrawing();
			},
			onDragEnd: () => {
				commitPreview();
				previewGeometry = null;
				dragState = null;
				setSuppressNextMapClick(true);
				syncDrawing();
			},
			onDragCancel: () => {
				previewGeometry = null;
				dragState = null;
				syncDrawing();
			}
		});
	}

	function handleMapClick(event: MapMouseEvent) {
		if (getActiveTool() !== 'geometry') return false;
		const coordinate = eventCoordinate(event);
		if (!coordinate || !coordinate.every(Number.isFinite)) return false;
		const target = activeTarget();
		const geometry = activeGeometry();
		if (!geometry || geometry.type === 'Point') {
			state.commitGeometry(
				target,
				{ type: 'Point', coordinates: coordinate },
				'Move point geometry'
			);
			selectedVertex = null;
			syncDrawing();
			return true;
		}
		if (isAreaGeometry(geometry) && selectedVertex) {
			selectedVertex = null;
			syncDrawing();
			return true;
		}
		return false;
	}

	function beginTranslateDrag() {
		const target = activeTarget();
		const geometry = activeGeometry();
		if (!geometry) return false;
		dragState = {
			target,
			geometry: cloneGeoJsonGeometry(geometry),
			kind: geometry.type === 'Point' ? 'point' : 'center',
			polygonIndex: 0,
			vertexIndex: -1
		};
		previewGeometry = dragState.geometry;
		syncDrawing();
		return true;
	}

	function updateTranslateDrag(coordinate: Point2D) {
		if (!dragState || !coordinate.every(Number.isFinite)) return;
		previewGeometry = translateGeometryTo(dragState.geometry, coordinate);
		syncDrawing();
	}

	function commitTranslateDrag(coordinate: Point2D) {
		if (!dragState) {
			const target = activeTarget();
			const geometry = activeGeometry();
			if (!geometry || !coordinate.every(Number.isFinite)) return false;
			state.commitGeometry(
				target,
				translateGeometryTo(geometry, coordinate),
				geometry.type === 'Point' ? 'Move point geometry' : 'Translate polygon geometry'
			);
			syncDrawing();
			return true;
		}
		if (coordinate.every(Number.isFinite)) {
			previewGeometry = translateGeometryTo(dragState.geometry, coordinate);
		}
		commitPreview();
		previewGeometry = null;
		dragState = null;
		syncDrawing();
		return true;
	}

	function cancelTranslateDrag() {
		if (!dragState) return;
		previewGeometry = null;
		dragState = null;
		syncDrawing();
	}

	function deleteSelectedVertex() {
		const target = activeTarget();
		if (getActiveTool() !== 'geometry' || !selectedVertex) return false;
		if (selectedVertex.targetKey !== targetKey(target)) return false;
		const geometry = activeGeometry();
		const { polygonIndex, vertexIndex } = selectedVertex;
		const path = getGeometryPath(geometry, polygonIndex);
		if (!isAreaGeometry(geometry) || getEditablePath(path, { closed: true }).length <= 3)
			return false;
		const next = editGeometryPath(
			geometry,
			(ringPath, closed) => removePathVertex(ringPath, vertexIndex, { closed }),
			polygonIndex
		);
		state.commitGeometry(target, next, 'Delete polygon vertex');
		selectedVertex = null;
		syncDrawing();
		return true;
	}

	function clearSelection() {
		selectedVertex = null;
		syncDrawing();
	}

	function focusTarget(target = activeTarget()) {
		const geometry = state.getMetadataTarget(target)?.geometry;
		const center = getGeometryCenter(geometry);
		const map = getMap();
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function moveTargetToMapCenter(target = activeTarget()) {
		const geometry = state.getMetadataTarget(target)?.geometry;
		const mapCenter = getMap()?.getCenter?.();
		const center: Point2D | null = mapCenter
			? [Number(mapCenter.lng), Number(mapCenter.lat)]
			: null;
		if (!geometry || !center?.every(Number.isFinite)) return false;
		state.commitGeometry(
			target,
			translateGeometryTo(geometry, center),
			'Move geometry to map center'
		);
		return true;
	}

	function cleanup() {
		cleanupDragHandlers?.();
		cleanupDragHandlers = null;
		while (mapCleanups.length) mapCleanups.pop()?.();
		// The parent map component can remove MapLibre before this component's
		// onDestroy callback runs. Map#getSource requires a live style.
		if (handlerMap?.isStyleLoaded?.())
			(handlerMap.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData({
				type: 'FeatureCollection',
				features: []
			});
		handlerMap = null;
		previewGeometry = null;
		dragState = null;
	}

	return {
		get selectedVertex() {
			return selectedVertex;
		},
		ensureMapLayers,
		initHandlers,
		syncDrawing,
		handleMapClick,
		beginTranslateDrag,
		updateTranslateDrag,
		commitTranslateDrag,
		cancelTranslateDrag,
		deleteSelectedVertex,
		clearSelection,
		focusTarget,
		moveTargetToMapCenter,
		cleanup
	};
}
