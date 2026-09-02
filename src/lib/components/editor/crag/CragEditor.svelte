<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
import { createCragEditorSession, normalizeCragSector, provideCragEditorSession } from '$lib/state/crag-session.svelte.js';
	import { provideCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import CragEditorLayout from '$lib/components/editor/crag/CragEditorLayout.svelte';
	import RouteDetailModal from '$lib/components/editor/crag/RouteDetailModal.svelte';
	import { CRAG_SESSION_KEY } from '$lib/components/editor/crag/crag-editor-options.js';
	import { writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import { storage } from '$lib/assets/js/storage-utils.js';
	import { Topo } from '$lib/assets/js/topo-paths.js';
	import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';
	import {
		addEquipment,
		removeEquipment,
	} from '$lib/components/editor/crag/crag-editor-sectors.js';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.js';
	import { createCragRouteTool } from '$lib/components/editor/crag/CragRouteTool.svelte.js';
	import { createCragSelectTool } from '$lib/components/editor/crag/CragSelectTool.svelte.js';
	import { createCragSectorTool } from '$lib/components/editor/crag/CragSectorTool.svelte.js';
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
	import { createRouteEditController } from './route-editing.js';

	let { inspectorShadow = true, initialSession = null } = $props();
	const cragEditorState = provideCragEditorSession(createCragEditorSession());

	// Layout flags
	let isCompact = $derived(viewport.isCompact);
	let isMedium = $derived(viewport.isMedium);
	let isExpanded = $derived(viewport.isExpanded);
	let isLandscape = $derived(viewport.isLandscape);

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
	let routeTool;

	let selectedRouteEntry = $derived.by(() => {
		if (selectedObject?.type !== 'route') return null;
		return cragEditorState.routeDocuments
			.flatMap((document) =>
				(document.data?.routes || []).map((route) => ({ document, route }))
			)
			.find(({ document, route }) => `${document.path}:${route.id}` === selectedObject.key);
	});
	let routeEditDraft = $state(null);
	let isRoutePathDrawing = $derived(routeEditDraft !== null);
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
		state: cragEditorState,
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value),
		getRoutePathTarget: () => routeEditDraft,
		onSaveRoutePath: (...args) => routeTool?.saveRoutePathCoordinates(...args),
		onRoutePathDrawingEnd: () => (routeEditDraft = null),
		onPathFinished: () => selectObject(null),
		onPathCancelled: () => selectObject(null),
		onTrackPointDragStart: () => syncEditorData(),
		onTrackPointDragEnd: () => syncEditorData(),
		getTrackFeature: getCragTrackFeature,
		 saveTrackGeometry: saveCragTrackGeometry
	});
	const routeEditController = createRouteEditController({
		getSelection: () => selectedObject,
		getDraft: () => routeEditDraft,
		commitDraft: () => trackEditor.commitRoutePathEdit(),
		setSelection: (value) => (selectedObject = value),
		setDraft: (value) => (routeEditDraft = value)
	});
	const selectObject = routeEditController.selectObject;
	const startRoutePathDraft = routeEditController.startDraft;
	let currentTrackPoints = $derived(trackEditor.currentTrackPoints);
	let trackDraftMode = $derived(trackEditor.trackDraftMode);
	let isSnappingEnabled = $derived(trackEditor.isSnappingEnabled);
	let isRoutingTrack = $derived(trackEditor.isRoutingTrack);
	let activeTrackDragState = $derived(trackEditor.draggingTrackPoint);
	let activeTrackTarget = $derived(trackEditor.activeTrackTarget);
	let selectedTrackPointIndexes = $derived(trackEditor.selectedTrackPointIndexes);
	let selectedTrackPointCount = $derived(trackEditor.selectedTrackPointCount);

	const addTrackPoint = (...args) => trackEditor.addTrackPoint(...args);
	const handleTrackConfirm = (...args) => trackEditor.handleTrackConfirm(...args);
	const startRoutingDraft = (...args) => trackEditor.startRoutingDraft(...args);
	const undoTrackPoint = (...args) => trackEditor.undoTrackPoint(...args);
	const splitEditingTrack = (...args) => trackEditor.splitEditingTrack(...args);
	const editTrack = (...args) => {
		toolOptionsOpen = true;
		return trackEditor.editTrack(...args);
	};
	const editRoutePathTrack = (...args) => {
		toolOptionsOpen = true;
		return trackEditor.editRoutePath(...args);
	};
	const cancelTrackEdit = (...args) => trackEditor.cancelTrackEdit(...args);

	const accessEditor = useCragAccessEditor({
		state: cragEditorState,
		getMap: () => map,
		getIsMapLoaded: () => isMapLoaded,
		getActiveTool: () => activeTool
	});
	let detectedAssets = $derived(accessEditor.detectedAssets);
	let isDetectionLoading = $derived(accessEditor.isDetectionLoading);
	let isDetectionZoomLimited = $derived(accessEditor.isDetectionZoomLimited);
	const scanNearbyAssets = (...args) => accessEditor.scanNearbyAssets(...args);
	const addDetectedAsset = (...args) => accessEditor.addDetectedAsset(...args);
	const addTransitPoint = (...args) => accessEditor.addTransitPoint(...args);
	const addParkingPoint = (...args) => accessEditor.addParkingPoint(...args);
	const addHutPoint = (...args) => accessEditor.addHutPoint(...args);

	const sectorTool = createCragSectorTool({
		state: cragEditorState,
		getMap: () => map,
		getSelection: () => selectedObject,
		selectObject,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value)
	});

	const sectorMapEditor = useCragSectorMapEditor({
		state: cragEditorState,
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		getSelectedObject: () => selectedObject,
		setSelectedObject: selectObject,
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value),
		onUpdateSectorCoordinates: sectorTool.updateSectorCoordinates,
		onCommitSectorGeometry: (id, geometry) => sectorTool.updateSectorGeometry(id, () => geometry)
	});
	let selectedSectorVertex = $derived(sectorMapEditor.selectedSectorVertex);
	let vertexDeleteUndo = $derived(sectorMapEditor.vertexDeleteUndo);
	let draggingSectorMarkerId = $derived(sectorMapEditor.draggingSectorMarkerId);
	const syncSectorMarkers = (...args) => sectorMapEditor.syncSectorMarkers(...args);

	routeTool = createCragRouteTool({
		state: cragEditorState,
		getSelection: () => selectedObject,
		selectObject,
		getRouteDraft: () => routeEditDraft,
		cancelTrackEdit,
		startRouteDraft: startRoutePathDraft,
		startRoutingDraft,
		editRoutePathTrack,
		setActiveTool: (value) => (activeTool = value)
	});

	const selectTool = createCragSelectTool({
		getMap: () => map,
		selectObject,
		setActiveTab: (value) => (activeTab = value),
		getRouteDocuments: () => cragEditorState.routeDocuments,
		onEditRoutePath: (path, routeId, pathId) => routeTool.editRoutePath(path, routeId, pathId),
		onEditTrack: editTrack
	});

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

	function restoreCragSession(session) {
		if (!session) return;

		cragEditorState.crag = session.crag
			? { ...session.crag, sectors: (session.crag.sectors || []).map(normalizeCragSector) }
			: cragEditorState.crag;
		cragEditorState.access = session.access || { type: 'FeatureCollection', version: 1, features: [] };
		cragEditorState.routeDocuments = session.routeDocuments || [];
	}

	function restoreLatestCragSession() {
		restoreCragSession(storage.get(CRAG_SESSION_KEY, null));
	}

	function saveLatestCragSession() {
		storage.set(CRAG_SESSION_KEY, {
			crag: $state.snapshot(cragEditorState.crag),
			access: $state.snapshot(cragEditorState.access),
			routeDocuments: $state.snapshot(cragEditorState.routeDocuments),
			updated: new Date().toISOString()
		});
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
		const isEditingRoutePath = routeEditDraft && trackDraftMode === 'editing';
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
		const splitMode = 'shared';
		const wasSplit = routeEditDraft
			? routeTool.splitRoutePath(
				routeEditDraft,
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

	// Restore before child components initialize. Hierarchy placement reads the
	// crag path during initialization and must not start with a blank path.
	if (isBlankCragSession()) restoreCragSession(untrack(() => initialSession) || storage.get(CRAG_SESSION_KEY, null));

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
			selectTool.handleMapClick(e);
			return;
		}
		if (activeTool === 'track' && ['select', 'delete'].includes(trackDraftMode)) {
			if (trackDraftMode === 'select') trackEditor.clearTrackSelection();
			return;
		}

		if (
			activeTool === 'track' &&
			!routeEditDraft &&
			currentTrackPoints.length === 0
		) {
			if (map.getLayer('route-paths-line')) {
				const routePathFeature = map.queryRenderedFeatures(e.point, { layers: ['route-paths-line'] })[0];
				const path = routePathFeature?.properties?.documentPath;
				const pathId = routePathFeature?.properties?.pathId;
				if (path && pathId) {
					const route = cragEditorState.routeDocuments.find((entry) => entry.path === path)?.data?.routes?.find((item) => (item.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId)));
				routeTool.editRoutePath(path, route?.id, pathId);
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
		const mapReady = isMapLoaded;
		if (tool === 'parking' || tool === 'transit' || tool === 'hut') {
			untrack(() => accessEditor.startNearbyAssetScan(tool));
			if (!mapReady) return;
		} else {
			untrack(() => accessEditor.clearDetectedAssets());
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
		cragEditorState.setCragGeometry({ ...cragEditorState.crag.geometry, coordinates });
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

	function initMarkersAndLayers(loadedMap = map) {
		if (!loadedMap) return;
		map = loadedMap;
		sectorTool.ensureMapLayers(loadedMap);
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
			setCragPosition([pos.lng, pos.lat]);
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
		const editingRoutePath = routeEditDraft || null;
		sectorTool.syncDrawing({
			selectedSectorVertex,
			draggingSectorVertex: untrack(() => sectorMapEditor.draggingSectorVertex)
		});
		source.setData(
			buildEditorFeatureCollection({
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
				selectedTrackPointIndexes,
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
			cragEditorState.setCragField('id', slugifyName(cragEditorState.crag.name));
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
			cragEditorState.setCragImages(uploadedImages);

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
		cragEditorState.setEquipment(addEquipment(cragEditorState.crag.equipment));
	}

	function removeEquipmentItem(idx) {
		cragEditorState.setEquipment(removeEquipment(cragEditorState.crag.equipment, idx));
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
		cragEditorState.setCragImages([...cragEditorState.crag.assets.images, ...images]);
	}

	function removeCragImage(index) {
		ensureCragAssets();
		const image = cragEditorState.crag.assets.images[index];
		if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
		cragEditorState.setCragImages(cragEditorState.crag.assets.images.filter(
			(_, i) => i !== index
		));
	}

	function getCragTrackFeature(target) {
		if (target?.kind === 'access') return cragEditorState.access.features.find((feature) => feature.id === target.featureId) || null;
		if (target?.kind === 'route-path') return cragEditorState.routeDocuments.find((entry) => entry.path === target.documentPath)?.data?.paths?.features?.find((feature) => String(feature.id) === String(target.pathId)) || null;
		return null;
	}

	function saveCragTrackGeometry(target, coordinates) {
		if (target?.kind === 'route-path') return Boolean(routeTool.saveRoutePathCoordinates(target, coordinates));
		if (target?.kind !== 'access') return false;
		cragEditorState.replaceAccessFeatures(
			cragEditorState.access.features.map((feature) => feature.id === target.featureId ? { ...feature, geometry: { type: 'LineString', coordinates } } : feature)
		);
		return true;
	}

	function undoCragEdit() {
		return cragEditorState.canUndo ? cragEditorState.undo() : routeTool.undoDeleteRoutePath();
	}

	provideCragEditorTools({
		trackEditor,
		sectorTool,
		routeTool,
		accessEditor,
		actions: {
			back: () => goto(base + '/'),
			startTrackCut,
			confirmTrackCut,
			cancelTrackCut: resetTrackCut,
			undo: undoCragEdit,
			redo: () => cragEditorState.redo(),
			export: saveToServer,
			centerMapOnUser,
			addCragImages,
			removeCragImage,
			addEquipmentItem,
			removeEquipmentItem,
			handleFlightPlanGenerated
		}
	});

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
	bind:activeTool
	bind:toolOptionsOpen
	bind:mapStyle
	bind:activeTab
	{detectedAssets}
	{isDetectionLoading}
	{isDetectionZoomLimited}
	bind:selectedObject
	{currentTrackPoints}
	{activeTrackTarget}
	{trackDraftMode}
	{selectedTrackPointCount}
	{isRoutingTrack}
	{hasPendingTrackCut}
	{isRoutePathDrawing}
	{saveStatus}
	{saveError}
	{vertexDeleteUndo}
/>

<RouteDetailModal
	routeEntry={selectedRouteEntry}
	onClose={() => selectObject(null)}
/>

{#if activeTool === 'cut' && cutLineEnd && !pendingTrackCut}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		No intersection found. Click again to start a new cut line.
	</div>
{/if}
