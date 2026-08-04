<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import CragEditorLayout from '$lib/components/editor/crag/CragEditorLayout.svelte';
	import CragEditorBottomSheet from '$lib/components/editor/crag/CragEditorBottomSheet.svelte';
	import RouteDetailModal from '$lib/components/editor/crag/RouteDetailModal.svelte';
	import {
		availableTags,
		commonEquipment,
		CRAG_SESSION_KEY,
		cragTypes,
		securityOptions
	} from '$lib/components/editor/crag/crag-editor-options.js';
	import { writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import { createPolygonAround, getGeometryCenter, translateGeometryTo } from '$lib/assets/js/sector-utils.js';
	import { storage } from '$lib/assets/js/storage-utils.js';
	import { Topo } from '$lib/assets/js/topo-paths.js';
	import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';
	import {
		addEquipment,
		addSector,
		createDefaultSector,
		duplicateSectorById,
		moveSectorById,
		removeEquipment,
		removeSectorById
	} from '$lib/components/editor/crag/crag-editor-sectors.js';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.js';
	import { useCragSectorMapEditor } from '$lib/components/editor/crag/use-crag-sector-map-editor.svelte.js';
	import { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.js';
	import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
	import {
		buildEditorFeatureCollection,
		createIconMarkerElement,
		ensureCragEditorLayers,
		syncFlightPlanPreview
	} from '$lib/components/editor/crag/crag-editor-map.js';
	import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.js';
	import { generateId, generateRouteId } from '$lib/assets/js/id-utils.js';
	import { rockTypes } from '$lib/config.js';
	import { assignTopoPath, createPathFeature, deleteTopoPath, findTopoPath, routesUsingTopoPath, splitTopoPath } from '$lib/assets/js/topo-document-paths.js';

	let { inspectorShadow = true } = $props();

	// Layout flags
	let isCompact = $derived(viewport.isCompact);
	let isMedium = $derived(viewport.isMedium);
	let isExpanded = $derived(viewport.isExpanded);
	let isLandscape = $derived(viewport.isLandscape);
	let isTouch = $derived(viewport.isTouch);

	let map = $state();
	let cragMarker;
	let mapStyle = $state('transport');
	let isMapLoaded = $state(false);
	let saveStatus = $state('idle');
	let saveError = $state('');

	let activeTool = $state('select'); // 'select' | 'position' | 'transit' | 'parking' | 'hut' | 'track'
	let toolOptionsOpen = $state(false);
	let activeTab = $state('info'); // 'info' | 'registry'
	let selectedObject = $state(null);
	// Preview state is replaced whenever the user generates another mission.
	let flightPlan = $state(null);

	let selectedRouteEntry = $derived.by(() => {
		if (selectedObject?.type !== 'route') return null;
		return cragEditorState.routeDocuments
			.flatMap((document) =>
				(document.data?.routes || []).map((route) => ({ document, route }))
			)
			.find(({ document, route }) => `${document.path}:${route.id}` === selectedObject.key);
	});
	let routePathAssignmentContext = $state(null);
	let isRoutePathDrawing = $derived(routePathAssignmentContext !== null);
	let cutLineStart = $state(null);
	let cutLineEnd = $state(null);
	let pendingTrackCut = $state(null);
	let hasPendingTrackCut = $derived(pendingTrackCut !== null);
	let areTrackCutDragHandlersReady = false;
	let areTrackViewportSyncHandlersReady = false;
	let suppressNextMapClick = false;
	let canAutosaveSession = $state(false);
	let autosaveSessionTimeout;

	const trackEditor = useCragTrackEditor({
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value),
		getRoutePathTarget: () => routePathAssignmentContext,
		onSaveRoutePath: saveRoutePathCoordinates,
		onRoutePathDrawingEnd: () => (routePathAssignmentContext = null),
		onPathFinished: () => (selectedObject = null),
		onPathCancelled: () => (selectedObject = null),
		onTrackPointDragStart: () => syncEditorData(),
		onTrackPointDragEnd: () => syncEditorData(),
		getTrackFeature: getCragTrackFeature,
		saveTrackGeometry: saveCragTrackGeometry
	});
	let currentTrackPoints = $derived(trackEditor.currentTrackPoints);
	let trackDraftMode = $derived(trackEditor.trackDraftMode);
	let isSnappingEnabled = $derived(trackEditor.isSnappingEnabled);
	let isRoutingTrack = $derived(trackEditor.isRoutingTrack);
	let activeTrackDragState = $derived(trackEditor.draggingTrackPoint);
	let activeTrackTarget = $derived(trackEditor.activeTrackTarget);

	const addTrackPoint = (...args) => trackEditor.addTrackPoint(...args);
	const handleTrackConfirm = (...args) => trackEditor.handleTrackConfirm(...args);
	const startRoutingDraft = (...args) => trackEditor.startRoutingDraft(...args);
	const setTrackDraftMode = (...args) => trackEditor.setTrackDraftMode(...args);
	const undoTrackPoint = (...args) => trackEditor.undoTrackPoint(...args);
	const reverseTrack = (...args) => trackEditor.reverseTrack(...args);
	const trimTrackStart = (...args) => trackEditor.trimTrackStart(...args);
	const trimTrackEnd = (...args) => trackEditor.trimTrackEnd(...args);
	const simplifyTrack = (...args) => trackEditor.simplifyTrack(...args);
	const removeTrack = (...args) => trackEditor.removeTrack(...args);
	const splitEditingTrack = (...args) => trackEditor.splitEditingTrack(...args);
	const finalizeTrack = (...args) => trackEditor.finalizeTrack(...args);
	const editTrack = (...args) => {
		toolOptionsOpen = true;
		return trackEditor.editTrack(...args);
	};
	const editRoutePathTrack = (...args) => {
		toolOptionsOpen = true;
		return trackEditor.editRoutePath(...args);
	};
	const cancelTrackEdit = (...args) => trackEditor.cancelTrackEdit(...args);
	const handleGpxUpload = (...args) => trackEditor.handleGpxUpload(...args);

	const accessEditor = useCragAccessEditor({
		getMap: () => map,
		getIsMapLoaded: () => isMapLoaded,
		getActiveTool: () => activeTool
	});
	let detectedAssets = $derived(accessEditor.detectedAssets);
	const scanNearbyAssets = (...args) => accessEditor.scanNearbyAssets(...args);
	const setHoverHighlight = (...args) => accessEditor.setHoverHighlight(...args);
	const addDetectedAsset = (...args) => accessEditor.addDetectedAsset(...args);
	const addTransitPoint = (...args) => accessEditor.addTransitPoint(...args);
	const addParkingPoint = (...args) => accessEditor.addParkingPoint(...args);
	const addHutPoint = (...args) => accessEditor.addHutPoint(...args);
	const removeAccessFeature = (...args) => accessEditor.removeAccessFeature(...args);

	const sectorMapEditor = useCragSectorMapEditor({
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		getSelectedObject: () => selectedObject,
		setSelectedObject: (value) => (selectedObject = value),
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value),
		onUpdateSectorCoordinates: updateSectorCoordinates,
		onCommitSectorGeometry: (id, geometry) => updateSectorGeometry(id, () => geometry)
	});
	let selectedSectorVertex = $derived(sectorMapEditor.selectedSectorVertex);
	let vertexDeleteUndo = $derived(sectorMapEditor.vertexDeleteUndo);
	let draggingSectorMarkerId = $derived(sectorMapEditor.draggingSectorMarkerId);
	const syncSectorMarkers = (...args) => sectorMapEditor.syncSectorMarkers(...args);
	const undoSectorVertexDelete = (...args) => sectorMapEditor.undoSectorVertexDelete(...args);

	function isBlankCragSession() {
		return (
			!cragEditorState.crag.id &&
			!cragEditorState.crag.name &&
			!cragEditorState.crag.path &&
			!cragEditorState.crag.description_de &&
			!cragEditorState.crag.description_en &&
			(cragEditorState.crag.equipment || []).length === 0 &&
			(cragEditorState.crag.sectors || []).length === 0 &&
			(cragEditorState.access?.features || []).length === 0
		);
	}

	function restoreLatestCragSession() {
		const session = storage.get(CRAG_SESSION_KEY, null);
		if (!session) return;

		cragEditorState.crag = session.crag || cragEditorState.crag;
		cragEditorState.access = session.access || { type: 'FeatureCollection', version: 1, features: [] };
	}

	function saveLatestCragSession() {
		storage.set(CRAG_SESSION_KEY, {
			crag: $state.snapshot(cragEditorState.crag),
			access: $state.snapshot(cragEditorState.access),
			updated: new Date().toISOString()
		});
	}

	function focusSector(sector) {
		selectedObject = { type: 'sector', id: sector.id };
		activeTool = 'position';
		const center = getGeometryCenter(sector.geometry);
		if (center && map) map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 400 });
	}

	function coordinatesEqual(a, b) {
		return Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
	}

	function segmentLineIntersection(a, b, c, d) {
		const [x1, y1] = a;
		const [x2, y2] = b;
		const [x3, y3] = c;
		const [x4, y4] = d;
		const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		if (Math.abs(denominator) < 1e-12) return null;

		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
		const u = -((x1 - x2) * (y1 - y2) - (y1 - y2) * (x1 - x3)) / denominator;
		if (t < 0 || t > 1 || u < 0 || u > 1) return null;
		return { coordinate: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)], t };
	}

	function findTrackCutIntersection(coordinates, lineStart, lineEnd) {
		for (let index = 0; index < coordinates.length - 1; index += 1) {
			const intersection = segmentLineIntersection(
				coordinates[index],
				coordinates[index + 1],
				lineStart,
				lineEnd
			);
			if (intersection) return { ...intersection, segmentIndex: index };
		}
		return null;
	}

	function splitTrackAtIntersection(coordinates, intersection) {
		const { coordinate, segmentIndex } = intersection;
		const startCoordinates = coordinates.slice(0, segmentIndex + 1);
		const endCoordinates = coordinates.slice(segmentIndex + 1);
		if (!coordinatesEqual(startCoordinates.at(-1), coordinate)) startCoordinates.push(coordinate);
		if (!coordinatesEqual(endCoordinates[0], coordinate)) endCoordinates.unshift(coordinate);
		return [startCoordinates, endCoordinates];
	}

	function cutOverlayFeatures() {
		const features = [];
		if (cutLineStart && cutLineEnd) {
			features.push({
				type: 'Feature',
				properties: { feature: 'track-cut-line' },
				geometry: { type: 'LineString', coordinates: [cutLineStart, cutLineEnd] }
			});
		}
		for (const [cutPointIndex, coordinate] of [cutLineStart, cutLineEnd].entries()) {
			if (!coordinate) continue;
			features.push({
				type: 'Feature',
				properties: { feature: 'track-cut-point', cutPointIndex },
				geometry: { type: 'Point', coordinates: coordinate }
			});
		}
		if (pendingTrackCut?.intersection) {
			features.push({
				type: 'Feature',
				properties: { feature: 'track-cut-intersection', intersection: true },
				geometry: { type: 'Point', coordinates: pendingTrackCut.intersection }
			});
		}
		return { type: 'FeatureCollection', features };
	}

	function syncTrackCutOverlay() {
		const source = map?.getSource('track-cut-overlay');
		if (source) source.setData(cutOverlayFeatures());
	}

	function trackDragOverlayFeatures() {
		if (!activeTrackDragState) return { type: 'FeatureCollection', features: [] };
		const { pointIndex, coordinate } = activeTrackDragState;
		const features = [];
		const dragPoints = [...currentTrackPoints];
		dragPoints[pointIndex] = coordinate;
		if (currentTrackPoints[pointIndex - 1]) {
			features.push({
				type: 'Feature',
				properties: { feature: 'track-drag-edge' },
				geometry: {
					type: 'LineString',
					coordinates: [currentTrackPoints[pointIndex - 1], coordinate]
				}
			});
		}
		if (currentTrackPoints[pointIndex + 1]) {
			features.push({
				type: 'Feature',
				properties: { feature: 'track-drag-edge' },
				geometry: {
					type: 'LineString',
					coordinates: [coordinate, currentTrackPoints[pointIndex + 1]]
				}
			});
		}
		features.push({
			type: 'Feature',
			properties: { feature: 'track-drag-point' },
			geometry: { type: 'Point', coordinates: coordinate }
		});
		for (let index = 0; index < dragPoints.length - 1; index += 1) {
			const first = dragPoints[index];
			const second = dragPoints[index + 1];
			if (!first || !second) continue;
			features.push({
				type: 'Feature',
				properties: { feature: 'track-midpoint', pointIndex: index + 1 },
				geometry: {
					type: 'Point',
					coordinates: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]
				}
			});
		}
		features.push({
			type: 'Feature',
			properties: { feature: 'track-vertex-delete', pointIndex },
			geometry: { type: 'Point', coordinates: coordinate }
		});
		return { type: 'FeatureCollection', features };
	}

	function syncTrackDragOverlay() {
		const source = map?.getSource('tracks-drag-overlay');
		if (source) source.setData(trackDragOverlayFeatures());
	}

	function visibleDrawingPointIndexes(points) {
		const bounds = map?.getBounds?.();
		if (!bounds) return [];
		const indexes = [];
		for (let index = 0; index < points.length; index += 1) {
			if (bounds.contains(points[index])) indexes.push(index);
		}
		return indexes;
	}

	function initTrackViewportSyncHandlers() {
		if (!map || areTrackViewportSyncHandlersReady) return;
		areTrackViewportSyncHandlersReady = true;
		for (const event of ['moveend', 'zoomend', 'resize']) map.on(event, syncEditorData);
	}

	function resetTrackCut() {
		cutLineStart = null;
		cutLineEnd = null;
		pendingTrackCut = null;
		syncTrackCutOverlay();
	}

	function rebuildPendingTrackCut() {
		if (!cutLineStart || !cutLineEnd || currentTrackPoints.length < 2) {
			pendingTrackCut = null;
			return;
		}
		const intersection = findTrackCutIntersection(currentTrackPoints, cutLineStart, cutLineEnd);
		if (!intersection) {
			pendingTrackCut = null;
			return;
		}
		const [startCoordinates, endCoordinates] = splitTrackAtIntersection(
			currentTrackPoints,
			intersection
		);
		pendingTrackCut =
			startCoordinates.length > 1 && endCoordinates.length > 1
				? { startCoordinates, endCoordinates, intersection: intersection.coordinate }
				: null;
	}

	function startTrackCut() {
		const isEditingRoutePath = routePathAssignmentContext && trackDraftMode === 'editing';
		if (
			(activeTrackTarget === null && !isEditingRoutePath) ||
			currentTrackPoints.length < 2
		)
			return;
		activeTool = 'cut';
		resetTrackCut();
	}

	function handleTrackCutClick(coordinate) {
		if (!cutLineStart || pendingTrackCut) {
			cutLineStart = coordinate;
			cutLineEnd = null;
			pendingTrackCut = null;
		} else {
			cutLineEnd = coordinate;
			rebuildPendingTrackCut();
		}
		syncTrackCutOverlay();
	}

	function confirmTrackCut() {
		if (!pendingTrackCut) return;
		let splitMode = 'shared';
		if (routePathAssignmentContext && typeof window !== 'undefined') {
			const choice = window.prompt('Split shared path for all routes or only this route? Enter "shared" or "route".', 'shared');
			if (choice === null) return;
			splitMode = choice.trim().toLowerCase().startsWith('route') ? 'route-specific' : 'shared';
		}
		const wasSplit = routePathAssignmentContext
			? splitRoutePath(
				routePathAssignmentContext,
					pendingTrackCut.startCoordinates,
					pendingTrackCut.endCoordinates,
					splitMode
				)
			: splitEditingTrack(pendingTrackCut.startCoordinates, pendingTrackCut.endCoordinates);
		if (wasSplit) resetTrackCut();
	}

	function initTrackCutDragHandlers() {
		if (!map || areTrackCutDragHandlersReady) return;
		areTrackCutDragHandlersReady = true;
		initMapPointDragHandlers({
			map,
			layers: ['track-cut-points'],
			canDrag: () => activeTool === 'cut',
			getDragState: (event) => {
				const cutPointIndex = Number(event.features?.[0]?.properties?.cutPointIndex);
				return cutPointIndex === 0 || cutPointIndex === 1 ? { cutPointIndex } : null;
			},
			onDragMove: ({ cutPointIndex }, event) => {
				const coordinate = [event.lngLat.lng, event.lngLat.lat];
				if (cutPointIndex === 0) cutLineStart = coordinate;
				else cutLineEnd = coordinate;
				rebuildPendingTrackCut();
			syncTrackCutOverlay();
		},
			onDragEnd: () => {
				suppressNextMapClick = true;
			}
		});
	}

	onMount(() => {
		if (isBlankCragSession()) restoreLatestCragSession();
		canAutosaveSession = true;

		const handleKeyDown = (e) => {
			if (activeTool === 'track') {
				if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') handleTrackConfirm();
				else if (e.key === 'Escape') cancelTrackEdit();
				else if (e.key === 'Backspace' || e.key === 'Delete') {
					undoTrackPoint();
				}
			} else if (activeTool === 'cut' && e.key === 'Escape') {
				resetTrackCut();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			sectorMapEditor.cleanup();
			accessEditor.cleanup();
			clearTimeout(autosaveSessionTimeout);
		};
	});

	async function handleMapClick(e) {
		if (suppressNextMapClick) {
			suppressNextMapClick = false;
			return;
		}

		if (activeTool === 'cut') {
			handleTrackCutClick([e.lngLat.lng, e.lngLat.lat]);
			return;
		}

		if (activeTool === 'select') {
			const hitRadius = getMapHitRadius(24) / 2;
			const layers = [
				'routes-line',
				'route-paths-line',
				'tracks-line-saved',
				'sector-polygons-fill',
				'sector-polygons-outline'
			].filter((layer) => map.getLayer(layer));
			const features = layers.length
				? map.queryRenderedFeatures(
					[
						[e.point.x - hitRadius, e.point.y - hitRadius],
						[e.point.x + hitRadius, e.point.y + hitRadius]
					],
					{ layers }
				  )
				: [];
			const properties = (
				features.find(({ properties }) => properties?.feature === 'route-path') ||
				features.find(({ properties }) => properties?.feature === 'route') ||
				features.find(({ properties }) => properties?.kind === 'approach') ||
				features.find(({ properties }) => properties?.feature === 'sector') ||
				features[0]
			)?.properties || {};
			if (properties.feature === 'route-path' && properties.documentPath && properties.pathId) {
				selectedObject = { type: 'route-path', documentPath: properties.documentPath, pathId: properties.pathId };
				const route = cragEditorState.routeDocuments.find((entry) => entry.path === properties.documentPath)?.data?.routes?.find((item) => (item.pathRefs || []).some((ref) => String(ref.pathId) === String(properties.pathId)));
				editRoutePath(properties.documentPath, route?.id, properties.pathId);
				return;
			}

			if (properties.feature === 'route' && properties.documentPath && properties.routeId) {
				selectedObject = {
					type: 'route',
					key: `${properties.documentPath}:${properties.routeId}`
				};
				return;
			}
			if (properties.feature === 'sector' && properties.id) {
				selectedObject = { type: 'sector', id: properties.id };
				activeTab = 'sectors';
				return;
			}
			if (properties.kind === 'approach' && properties.accessFeatureId) {
				selectedObject = { type: 'approach', id: properties.accessFeatureId };
				editTrack(properties.accessFeatureId);
				return;
			}
		}

		if (
			activeTool === 'track' &&
			!routePathAssignmentContext &&
			currentTrackPoints.length === 0
		) {
			if (map.getLayer('route-paths-line')) {
				const routePathFeature = map.queryRenderedFeatures(e.point, { layers: ['route-paths-line'] })[0];
				const path = routePathFeature?.properties?.documentPath;
				const pathId = routePathFeature?.properties?.pathId;
				if (path && pathId) {
					const route = cragEditorState.routeDocuments.find((entry) => entry.path === path)?.data?.routes?.find((item) => (item.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId)));
					editRoutePath(path, route?.id, pathId);
					return;
				}
			}

			if (map.getLayer('tracks-line-saved')) {
				const trackFeature = map.queryRenderedFeatures(e.point, { layers: ['tracks-line-saved'] })[0];
				const accessFeatureId = trackFeature?.properties?.accessFeatureId;
				if (accessFeatureId) {
					editTrack(accessFeatureId);
					return;
				}
			}
		}

		if (map.getLayer('detection-points')) {
			const hitRadius = getMapHitRadius(30);
			const bbox = [
				[e.point.x - hitRadius, e.point.y - hitRadius],
				[e.point.x + hitRadius, e.point.y + hitRadius]
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
			if (selectedObject?.type !== 'sector') setCragPosition(lngLat);
		} else if (activeTool === 'transit') {
			addTransitPoint(lngLat);
		} else if (activeTool === 'parking') {
			addParkingPoint(lngLat);
		} else if (activeTool === 'hut') {
			addHutPoint(lngLat);
		} else if (activeTool === 'track') {
			await addTrackPoint(lngLat);
		}
	}

	$effect(() => {
		if (!canAutosaveSession) return;

		const sessionString = JSON.stringify({
			crag: cragEditorState.crag,
				access: cragEditorState.access
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
		activeTrackDragState;
		syncTrackDragOverlay();
	});

	$effect(() => {
		if (activeTool !== 'cut' && (cutLineStart || cutLineEnd || pendingTrackCut)) resetTrackCut();
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		JSON.stringify(cragEditorState.crag.sectors || []);
		JSON.stringify(cragEditorState.routeDocuments || []);
		selectedObject;
		selectedSectorVertex;
		draggingSectorMarkerId;
		untrack(() => {
			if (!draggingSectorMarkerId && !sectorMapEditor.draggingSectorVertex) syncSectorMarkers();
			syncEditorData();
		});
	});

	$effect(() => {
		const tool = activeTool;
		if (tool === 'parking' || tool === 'transit' || tool === 'hut') {
			setTimeout(() => {
				if (activeTool === tool) scanNearbyAssets(tool);
			}, 300);
		} else {
			accessEditor.clearDetectedAssets();
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		accessEditor.syncDetectionHighlights();
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

	function setCragPosition(coordinates) {
		cragEditorState.crag.geometry.coordinates = coordinates;
		if (cragMarker) cragMarker.setLngLat(coordinates);
	}

	function centerMapOnUser() {
		if (!navigator.geolocation || !map) return;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinates = [position.coords.longitude, position.coords.latitude];
				map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 15), duration: 500 });
			},
			() => {
			},
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
		);
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

	function updateSectorGeometry(id, updater) {
		cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) =>
			sector.id === id ? { ...sector, geometry: updater(sector.geometry) } : sector
		);
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

	function initMarkersAndLayers(loadedMap = map) {
		if (!loadedMap) return;
		map = loadedMap;
		ensureCragEditorLayers(loadedMap);

		const markerPos = $state.snapshot(cragEditorState.crag.geometry.coordinates);
		if (cragMarker) cragMarker.remove();
		cragMarker = new maplibregl.Marker({
			element: createIconMarkerElement({
				className: 'crag-marker cursor-move',
				iconUrl: `${base}/icons/sports-climbing.png`,
				size: getMapMarkerSize(32)
			}),
			draggable: true
		})
			.setLngLat(markerPos)
			.addTo(loadedMap);
		cragMarker.on('dragstart', () => {
			accessEditor.clearDetectedAssets();
		});
		cragMarker.on('dragend', () => {
			const pos = cragMarker.getLngLat();
			cragEditorState.crag.geometry.coordinates = [pos.lng, pos.lat];
			if (activeTool === 'parking' || activeTool === 'transit' || activeTool === 'hut')
				scanNearbyAssets(activeTool);
		});

		syncSectorMarkers();
		accessEditor.syncAccessMarkers();

		trackEditor.initTrackPointDragHandlers();
		initTrackCutDragHandlers();
		initTrackViewportSyncHandlers();
		sectorMapEditor.initSectorEditHandlers();
		accessEditor.initDetectionPointHandlers();
		syncEditorData();
		syncTrackCutOverlay();
		syncTrackDragOverlay();
	}

	function syncEditorData() {
		const source = map?.getSource('crag-editor-data');
		if (!source) return;
		const drawingPoints = $state.snapshot(currentTrackPoints) || [];
		const editingRoutePath = routePathAssignmentContext || null;
		source.setData(
			buildEditorFeatureCollection({
				sectors: $state.snapshot(cragEditorState.crag.sectors) || [],
				savedAccessFeatures: $state.snapshot(cragEditorState.access?.features) || [],
				routes: (cragEditorState.routeDocuments || []).flatMap((document) =>
					(document.data?.routes || []).map((route) => ({
						key: `${document.path}:${route.id}`,
						route: $state.snapshot(route)
					}))
				),
				routePaths: (cragEditorState.routeDocuments || []).flatMap((document) =>
					(document.data?.paths?.features || []).map((feature) => ({
						documentPath: document.path,
						feature,
						assignedRouteIds: (document.data?.routes || [])
							.filter((route) => (route.pathRefs || []).some((ref) => String(ref.pathId) === String(feature.id)))
							.map((route) => route.id)
					}))
				),
				selectedObject,
				editingRoutePath,
				drawingPoints,
				visibleDrawingPointIndexes: visibleDrawingPointIndexes(drawingPoints),
				editingDrawingPath: trackDraftMode === 'editing',
				selectedTrackPointIndex: trackEditor.selectedTrackPointIndex,
				selectedSectorVertex,
				draggingSectorVertex: untrack(() => sectorMapEditor.draggingSectorVertex),
				activeTrackTarget,
				draggingTrackPointIndex: untrack(() => activeTrackDragState?.pointIndex ?? null),
				flightPlan: $state.snapshot(flightPlan)
			})
		);
		syncFlightPlanPreview(map, $state.snapshot(flightPlan));
	}

	function handleFlightPlanGenerated(plan) {
		flightPlan = plan;
		syncEditorData();
	}

	async function saveToServer() {
		if (!authState.requireAuth(() => saveToServer())) return;

		let savePath = cragEditorState.crag.path;

		saveStatus = 'saving';
		saveError = '';

		try {
			cragEditorState.crag.id = slugifyName(cragEditorState.crag.name);
			const topo = new Topo(savePath, cragEditorState.crag.id);
			ensureCragAssets();
			const sectors = $state.snapshot(cragEditorState.crag.sectors) || [];

			const uploadedImages = [];
			for (let i = 0; i < cragEditorState.crag.assets.images.length; i++) {
				const image = cragEditorState.crag.assets.images[i];
				if (image._file) {
					const imagePath = topo.getImagePath(image.name, i);
					await writeFile(topo.getImagePath(image.name, i), image._file, image.type || image._file.type);
					uploadedImages.push({ name: image.name, path: imagePath, type: image.type, size: image.size });
				} else {
					uploadedImages.push({
						name: image.name,
						path: image.path,
						type: image.type,
						size: image.size
					});
				}
			}
			cragEditorState.crag.assets.images = uploadedImages;

			await writeJson(topo.getCragPath(), {
				type: 'Feature',
				properties: {
					...$state.snapshot(cragEditorState.crag),
					sectors: sectors.map(({ id, name }) => ({ id, name })),
					id: cragEditorState.crag.id,
					updated: new Date().toISOString().split('T')[0]
				},
				geometry: cragEditorState.crag.geometry
			});

			for (const sector of sectors) {
				if (!sector.id) continue;
				const sectorTopo = new Topo(savePath, cragEditorState.crag.id, sector.id);
				const { geometry, ...properties } = sector;
				await writeJson(sectorTopo.getSectorPath(), {
					type: 'Feature',
					crag_id: cragEditorState.crag.id,
					sector_id: sector.id,
					properties,
					geometry
				});
			}

			await writeJson(topo.getAccessPath(), $state.snapshot(cragEditorState.access));

			for (const document of cragEditorState.routeDocuments) {
				if (document.dirty) await writeJson(document.path, document.data);
				document.dirty = false;
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

	function addEquipmentItem() {
		cragEditorState.crag.equipment = addEquipment(cragEditorState.crag.equipment);
	}

	function removeEquipmentItem(idx) {
		cragEditorState.crag.equipment = removeEquipment(cragEditorState.crag.equipment, idx);
	}

	function ensureCragAssets() {
		if (!cragEditorState.crag.assets) cragEditorState.crag.assets = { images: [] };
		if (!cragEditorState.crag.assets.images) cragEditorState.crag.assets.images = [];
	}

	function addCragImages(files = []) {
		ensureCragAssets();
		const images = files
			.filter((file) => file?.type?.startsWith('image/'))
			.map((file) => ({
				name: file.name,
				type: file.type,
				size: file.size,
				previewUrl: URL.createObjectURL(file),
				_file: file
			}));
		cragEditorState.crag.assets.images = [...cragEditorState.crag.assets.images, ...images];
	}

	function removeCragImage(index) {
		ensureCragAssets();
		const image = cragEditorState.crag.assets.images[index];
		if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
		cragEditorState.crag.assets.images = cragEditorState.crag.assets.images.filter(
			(_, i) => i !== index
		);
	}

	function createSector() {
		const sectors = cragEditorState.crag.sectors || [];
		const sector = createDefaultSector({
			sectors,
			cragCoordinates: cragEditorState.crag.geometry.coordinates
		});
		cragEditorState.crag.sectors = addSector(sectors, sector);
		selectedObject = { type: 'sector', id: sector.id };
		activeTab = 'sectors';
		activeTool = 'position';
	}

	function duplicateSector(id) {
		const result = duplicateSectorById(cragEditorState.crag.sectors || [], id);
		if (!result.duplicatedId) return;
		cragEditorState.crag.sectors = result.sectors;
		selectedObject = { type: 'sector', id: result.duplicatedId };
		activeTab = 'sectors';
	}

	function removeSector(id) {
		cragEditorState.crag.sectors = removeSectorById(cragEditorState.crag.sectors || [], id);
		if (selectedObject?.type === 'sector' && selectedObject.id === id) selectedObject = null;
	}

	function moveSector(id, direction) {
		cragEditorState.crag.sectors = moveSectorById(
			cragEditorState.crag.sectors || [],
			id,
			direction
		);
	}

	function getRouteDocument(sectorId) {
		return cragEditorState.routeDocuments.find((document) => document.sectorId === sectorId);
	}

	function createRouteDocument(sectorId) {
		const sectorTopo = new Topo(
			cragEditorState.crag.path,
			cragEditorState.crag.id,
			sectorId || undefined
		);
		return {
			path: sectorTopo.getTopoPath(),
			sectorId,
			data: {
				id: sectorId ? `${cragEditorState.crag.id}:${sectorId}` : cragEditorState.crag.id,
				crag_id: cragEditorState.crag.id,
				sector_id: sectorId || '',
				name: sectorId || cragEditorState.crag.name,
				routes: [],
				paths: { type: 'FeatureCollection', features: [] }
			},
			dirty: true
		};
	}

	function addRoute(sectorId = null) {
		let document = getRouteDocument(sectorId);
		if (!document) {
			document = createRouteDocument(sectorId);
			cragEditorState.routeDocuments = [...cragEditorState.routeDocuments, document];
		}

		let routeId;
		do {
			routeId = generateRouteId();
		} while (
			cragEditorState.routeDocuments.some((entry) =>
				(entry.data.routes || []).some((route) => route.id === routeId)
			)
		);

		const route = {
			id: routeId,
			name: '',
			type: 'sports-climbing',
			tags: [],
			pathRefs: []
		};
		document.data.routes = [...(document.data.routes || []), route];
		document.dirty = true;
		selectedObject = { type: 'route', key: `${document.path}:${route.id}` };
	}

	function deleteRoute(path, routeId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		if (!document) return;
		document.data.routes = (document.data.routes || []).filter((route) => route.id !== routeId);
		document.dirty = true;
		if (selectedObject?.type === 'route' && selectedObject.key === `${path}:${routeId}`) selectedObject = null;
	}

	function selectRoute(path, routeId) {
		selectedObject = { type: 'route', key: `${path}:${routeId}` };
	}

	function updateRoute(path, routeId, field, value) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		const route = document?.data.routes?.find((entry) => entry.id === routeId);
		if (!route) return;
		route[field] = value;
		document.dirty = true;
	}

	function touchRoute(path, routeId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		if (document?.data.routes?.some((route) => route.id === routeId)) document.dirty = true;
	}

	function getCragTrackFeature(target) {
		if (target?.kind === 'access') return cragEditorState.access.features.find((feature) => feature.id === target.featureId) || null;
		if (target?.kind === 'route-path') return cragEditorState.routeDocuments.find((entry) => entry.path === target.documentPath)?.data?.paths?.features?.find((feature) => String(feature.id) === String(target.pathId)) || null;
		return null;
	}

	function saveCragTrackGeometry(target, coordinates) {
		if (target?.kind === 'route-path') return Boolean(saveRoutePathCoordinates(target, coordinates));
		if (target?.kind !== 'access') return false;
		cragEditorState.access = {
			...cragEditorState.access,
			features: cragEditorState.access.features.map((feature) => feature.id === target.featureId ? { ...feature, geometry: { type: 'LineString', coordinates } } : feature)
		};
		return true;
	}

	function updateRoutePaths(path, routeId, update) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		const route = document?.data.routes?.find((entry) => entry.id === routeId);
		if (!route) return;
		route.pathRefs = update(route.pathRefs || []);
		document.dirty = true;
	}

	function addRoutePath(path, routeId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		if (!document) return;
		let pathId;
		do { pathId = generateId('path'); } while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
		document.data.paths.features = [...document.data.paths.features, { type: 'Feature', id: pathId, properties: { name: 'Route path' }, geometry: { type: 'LineString', coordinates: [] } }];
		updateRoutePaths(path, routeId, (refs) => [...refs, { pathId, role: 'main' }]);
		document.dirty = true;
		routePathAssignmentContext = { documentPath: path, routeId, pathId };
		startRoutingDraft();
	}

	function assignExistingRoutePath(path, routeId, pathId, role = 'main', label = '') {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		const assigned = assignTopoPath(document.data, routeId, pathId, { role, label });
		if (assigned) document.dirty = true;
		return assigned;
	}

	function createRoutePathFromAccess(documentPath, routeId, accessFeatureId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === documentPath);
		const access = cragEditorState.access.features.find((feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach');
		if (!document || !access?.geometry?.coordinates?.length) return false;
		document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
		let pathId;
		do { pathId = generateId('path'); } while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		document.data.paths.features = [...document.data.paths.features, createPathFeature(access.geometry.coordinates, { name: access.properties?.name || 'Copied access path' }, pathId)];
		assignTopoPath(document.data, routeId, pathId, { role: 'approach', label: access.properties?.name || '' });
		document.dirty = true;
		return true;
	}

	function saveRoutePathCoordinates({ documentPath, pathId }, coordinates) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === documentPath);
		const feature = document?.data.paths?.features?.find((item) => String(item.id) === String(pathId));
		if (!feature) return false;
		feature.geometry = { type: 'LineString', coordinates };
		document.dirty = true;
		return true;
	}

	function editRoutePath(path, routeId, pathId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		const coordinates = document?.data.paths?.features?.find((feature) => String(feature.id) === String(pathId))?.geometry?.coordinates;
		if (!Array.isArray(coordinates) || coordinates.length < 2) return;
		routePathAssignmentContext = { documentPath: path, routeId, pathId };
		editRoutePathTrack(coordinates);
	}

	function splitRoutePath({ documentPath, pathId, routeId }, startCoordinates, endCoordinates, mode = 'shared') {
		if (startCoordinates.length < 2 || endCoordinates.length < 2) return false;
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === documentPath);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		if (!splitTopoPath(document.data, pathId, startCoordinates, endCoordinates, { mode, routeId }).length) return false;
		document.dirty = true;
		cancelTrackEdit();
		activeTab = 'sectors';
		activeTool = 'position';
		return true;
	}

	function updateRoutePath(path, routeId, pathId, field, value) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.map((pathRef) =>
				String(pathRef.pathId) === String(pathId) ? { ...pathRef, [field]: value } : pathRef
			)
		);
	}

	function removeRoutePath(path, routeId, pathId) {
		updateRoutePaths(path, routeId, (paths) => paths.filter((ref) => String(ref.pathId) !== String(pathId)));
	}

	function deleteRoutePath(path, pathId) {
		const document = cragEditorState.routeDocuments.find((entry) => entry.path === path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		const count = routesUsingTopoPath(document.data, pathId).length;
		if (typeof window !== 'undefined' && !window.confirm(`Delete this path and remove it from ${count} route${count === 1 ? '' : 's'}?`)) return false;
		const deleted = deleteTopoPath(document.data, pathId);
		if (deleted) document.dirty = true;
		return deleted;
	}

</script>

<CragEditorMap
	bind:map
	bind:isMapLoaded
	bind:mapStyle
	initialCoordinates={$state.snapshot(cragEditorState.crag.geometry.coordinates)}
	onStyleLoad={initMarkersAndLayers}
	onMapClick={handleMapClick}
/>

<CragEditorLayout
	{inspectorShadow}
	{map}
	{isExpanded}
	{isCompact}
	{isMedium}
	{isLandscape}
	{CragEditorBottomSheet}
	bind:activeTool
	bind:toolOptionsOpen
	bind:mapStyle
	bind:activeTab
	{detectedAssets}
	bind:selectedObject
	{currentTrackPoints}
	{activeTrackTarget}
	{trackDraftMode}
	{isRoutingTrack}
	{hasPendingTrackCut}
	{isRoutePathDrawing}
	{cragTypes}
	{availableTags}
	{securityOptions}
	{rockTypes}
	{commonEquipment}
	{saveStatus}
	{saveError}
	onPlanGenerated={handleFlightPlanGenerated}
	routeDocuments={cragEditorState.routeDocuments}
	onBack={() => goto(base + '/')}
	onStartRoutingDraft={startRoutingDraft}
	onSetTrackDraftMode={setTrackDraftMode}
	onHandleTrackConfirm={handleTrackConfirm}
	onCancelTrackEdit={cancelTrackEdit}
	onUndoTrackPoint={undoTrackPoint}
	onStartTrackCut={startTrackCut}
	onConfirmTrackCut={confirmTrackCut}
	onCancelTrackCut={resetTrackCut}
	onReverseTrack={reverseTrack}
	onTrimTrackStart={trimTrackStart}
	onTrimTrackEnd={trimTrackEnd}
	onSimplifyTrack={simplifyTrack}
	onGpxUpload={handleGpxUpload}
	onExport={saveToServer}
	onCenterMapOnUser={centerMapOnUser}
	onAddEquipmentItem={addEquipmentItem}
	onRemoveEquipmentItem={removeEquipmentItem}
	onAddCragImages={addCragImages}
	onRemoveCragImage={removeCragImage}
	onAddSector={createSector}
	onDuplicateSector={duplicateSector}
	onRemoveSector={removeSector}
	onMoveSector={moveSector}
	onSetSectorGeometryType={setSectorGeometryType}
	onFocusSector={focusSector}
	onSetHoverHighlight={setHoverHighlight}
	onClearDetectedAssets={accessEditor.clearDetectedAssets}
	onAddDetectedAsset={addDetectedAsset}
	onRemoveAccessFeature={removeAccessFeature}
	onEditTrack={editTrack}
	onRemoveTrack={removeTrack}
	onFinalizeTrack={finalizeTrack}
	onAddParentRoute={() => addRoute()}
	onAddSectorRoute={addRoute}
	onSelectRoute={selectRoute}
	onUpdateRouteName={(path, routeId, name) => updateRoute(path, routeId, 'name', name)}
	onUpdateRoute={updateRoute}
	onAddRoutePath={addRoutePath}
	onEditRoutePath={editRoutePath}
	onUpdateRoutePath={updateRoutePath}
	onRemoveRoutePath={removeRoutePath}
	onDeleteRoutePath={deleteRoutePath}
	onDeleteRoute={deleteRoute}
	{vertexDeleteUndo}
	onUndoSectorVertexDelete={undoSectorVertexDelete}
/>

<RouteDetailModal
	routeEntry={selectedRouteEntry}
	onClose={() => (selectedObject = null)}
	onChange={touchRoute}
	onAddRoutePath={addRoutePath}
	onAssignRoutePath={assignExistingRoutePath}
	onCreateRoutePathFromAccess={createRoutePathFromAccess}
	onEditRoutePath={editRoutePath}
	onUpdateRoutePath={updateRoutePath}
	onRemoveRoutePath={removeRoutePath}
	onDeleteRoutePath={deleteRoutePath}
	routeDocuments={cragEditorState.routeDocuments}
	accessFeatures={cragEditorState.access.features}
/>

{#if activeTool === 'cut'}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		{#if pendingTrackCut}
			The cut intersects the track. Use the toolbar tick to split it, or X to discard the cut line.
		{:else if cutLineEnd}
			No intersection found. Click again to start a new cut line.
		{:else if cutLineStart}
			Click the second point of a line across the track.
		{:else}
			Click the first point of a line across the track.
		{/if}
	</div>
{/if}
