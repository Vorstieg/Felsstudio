<script>
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import {
		createCragEditorSession,
		normalizeCragSector,
		provideCragEditorSession
	} from '$lib/state/crag-session.svelte.ts';
	import { provideCragEditorTools } from '$lib/state/crag-controller-context.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import CragEditorLayout from '$lib/components/editor/crag/CragEditorLayout.svelte';
	import RouteDetailModal from '$lib/components/editor/crag/RouteDetailModal.svelte';
	import { readJson, renameFile, writeFile, writeJson } from '$lib/api/felslager.ts';
	import { authState } from '$lib/api/auth.svelte.js';
	import { storage } from '$lib/assets/js/storage-utils.ts';
	import { Topo } from '$lib/assets/js/topo-paths.js';
	import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';
	import {
		addEquipment,
		removeEquipment
	} from '$lib/components/editor/crag/crag-editor-sectors.ts';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.js';
	import { createCragRouteTool } from '$lib/components/editor/crag/CragRouteTool.svelte.js';
	import { createCragSelectTool } from '$lib/components/editor/crag/CragSelectTool.svelte.js';
	import { createCragSectorTool } from '$lib/components/editor/crag/CragSectorTool.svelte.js';
	import { useCragGeometryEditor } from '$lib/components/editor/crag/use-crag-geometry-editor.svelte.js';
	import { useCragSectorMarkers } from '$lib/components/editor/crag/use-crag-sector-markers.svelte.js';
	import { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.js';
	import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
	import {
		buildEditorFeatureCollection,
		createIconMarkerElement,
		ensureCragEditorLayers,
		syncFlightPlanPreview
	} from '$lib/components/editor/crag/crag-editor-map.js';
	import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.ts';
	import { createRouteEditController } from './route-editing.js';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.js';

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

	let activeTool = $state('select'); // 'select' | 'geometry' | 'transit' | 'parking' | 'hut' | 'track'
	let toolOptionsOpen = $state(false);
	let activeTab = $state('info'); // 'info' | 'registry'
	let selectedObject = $state(null);
	// Preview state is replaced whenever the user generates another mission.
	let flightPlan = $state(null);
	let routeTool;
	let geometryEditor;

	let selectedRouteEntry = $derived.by(() => {
		if (selectedObject?.type !== 'route') return null;
		return cragEditorState.routeDocuments
			.flatMap((document) => (document.data?.routes || []).map((route) => ({ document, route })))
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
	let activeCragDraftId = $state(null);
	const CRAG_DRAFTS_KEY = 'crag_editor_drafts_v1';
	const cragDraftSessionKey = (id) => `crag_editor_draft_session_${id}`;

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
	function selectObject(value) {
		routeEditController.selectObject(value);
		if (value?.type === 'sector') {
			cragEditorState.setActiveMetadataTarget({ type: 'sector', id: value.id });
			activeTab = 'info';
		} else if (value?.type === 'entry') {
			cragEditorState.setActiveMetadataTarget({ type: 'entry', key: value.key });
			activeTab = 'info';
		}
	}
	function selectMetadataTarget(target, { focus = true, edit = false } = {}) {
		if (!target) return;
		selectObject(target.type === 'entry'
			? { type: 'entry', key: target.key }
			: { type: 'sector', id: target.id });
		geometryEditor?.clearSelection();
		if (edit) activeTool = 'geometry';
		if (focus) geometryEditor?.focusTarget(target);
	}
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
		toolOptionsOpen = false;
		return trackEditor.editTrack(...args);
	};
	const editRoutePathTrack = (...args) => {
		toolOptionsOpen = false;
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

	geometryEditor = useCragGeometryEditor({
		state: cragEditorState,
		getMap: () => map,
		getActiveTool: () => activeTool,
		setSuppressNextMapClick: (value) => (suppressNextMapClick = value)
	});
	const sectorMarkers = useCragSectorMarkers({
		state: cragEditorState,
		getMap: () => map,
		getSelection: () => selectedObject,
		selectObject,
		setActiveTab: (value) => (activeTab = value)
	});
	const syncSectorMarkers = () => sectorMarkers.sync();

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

	function getRouteDocumentPath(crag, sectorId = null) {
		if (!crag?.path || !crag?.id) return '';
		return new Topo(crag.path, crag.id, sectorId || undefined).getTopoPath();
	}

	function normalizeRouteDocumentsForCrag(routeDocuments = [], crag = cragEditorState.crag) {
		return (routeDocuments || []).map((document) => {
			const sectorId = document.sectorId ?? document.data?.sector_id ?? null;
			const data = document.data ? { ...document.data } : document.data;
			if (data && crag?.id) data.crag_id = crag.id;
			if (data && sectorId) data.sector_id = sectorId;
			return {
				...document,
				sectorId,
				path: getRouteDocumentPath(crag, sectorId) || document.path,
				data
			};
		});
	}

	function restoreCragSession(session, id = null) {
		if (!session) return false;

		cragEditorState.crag = session.crag
			? { ...session.crag, sectors: (session.crag.sectors || []).map(normalizeCragSector) }
			: cragEditorState.crag;
		cragEditorState.access = session.access || {
			type: 'FeatureCollection',
			version: 1,
			features: []
		};
		cragEditorState.routeDocuments = normalizeRouteDocumentsForCrag(
			session.routeDocuments || [],
			cragEditorState.crag
		);
		cragEditorState.sectorStorageMoves = session.sectorStorageMoves || [];
		cragEditorState.sourceCrag = session.sourceCrag || null;
		cragEditorState.hierarchyEntries = session.hierarchyEntries || [];
		const currentEntry = cragEditorState.hierarchyEntries.find((entry) => entry.isCurrent);
		if (currentEntry) currentEntry.feature = cragEditorState.crag;
		cragEditorState.activeMetadataTarget = session.activeMetadataTarget ||
			(currentEntry ? { type: 'entry', key: currentEntry.key } : null);
		if (cragEditorState.activeMetadataTarget?.type === 'entry')
			selectedObject = { type: 'entry', key: cragEditorState.activeMetadataTarget.key };
		else if (cragEditorState.activeMetadataTarget?.type === 'sector')
			selectedObject = { type: 'sector', id: cragEditorState.activeMetadataTarget.id };
		activeCragDraftId = id;
		return true;
	}

	function getCragDraftIdFromUrl() {
		if (typeof window === 'undefined') return null;
		return new URL(window.location.href).searchParams.get('draft');
	}

	function setCragDraftParamInUrl(id) {
		if (!id || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (url.searchParams.get('draft') === id) return;
		url.searchParams.set('draft', id);
		window.history.replaceState(window.history.state, '', url);
	}

	function createCragDraftId() {
		return cragEditorState.crag.id ? `crag-${cragEditorState.crag.id}` : `draft-crag-${Date.now()}`;
	}

	function getCragDraftSession(id) {
		return id ? storage.get(cragDraftSessionKey(id), null) : null;
	}

	function saveLatestCragSession() {
		if (isBlankCragSession()) return;
		const timestamp = new Date().toISOString();
		const id = activeCragDraftId || createCragDraftId();
		const session = {
			crag: $state.snapshot(cragEditorState.crag),
			access: $state.snapshot(cragEditorState.access),
			routeDocuments: normalizeRouteDocumentsForCrag(
				$state.snapshot(cragEditorState.routeDocuments),
				cragEditorState.crag
			),
			sectorStorageMoves: $state.snapshot(cragEditorState.sectorStorageMoves),
			sourceCrag: $state.snapshot(cragEditorState.sourceCrag),
			hierarchyEntries: $state.snapshot(cragEditorState.hierarchyEntries),
			activeMetadataTarget: $state.snapshot(cragEditorState.activeMetadataTarget),
			updated: timestamp
		};
		const metadata = {
			id,
			name: session.crag?.name || 'Unnamed Crag',
			path: session.crag?.path || '',
			cragId: session.crag?.id || '',
			sourceCrag: session.sourceCrag || null,
			updated: timestamp
		};
		const drafts = storage.get(CRAG_DRAFTS_KEY, []).filter((draft) => draft.id !== id);
		storage.set(CRAG_DRAFTS_KEY, [metadata, ...drafts]);
		storage.set(cragDraftSessionKey(id), session);
		activeCragDraftId = id;
		setCragDraftParamInUrl(id);
	}

	function initializeCragSession(sourceSession) {
		const draftId = getCragDraftIdFromUrl();
		if (draftId) {
			restoreCragSession(getCragDraftSession(draftId), draftId);
			return;
		}
		if (sourceSession) restoreCragSession(sourceSession);
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
		if ((activeTrackTarget === null && !isEditingRoutePath) || currentTrackPoints.length < 2)
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
			geometryEditor.cleanup();
			sectorMarkers.cleanup();
			accessEditor.cleanup();
			clearTimeout(autosaveSessionTimeout);
		};
	});

	// Restore before child components initialize. Hierarchy placement reads the
	// crag path during initialization and must not start with a blank path.
	if (isBlankCragSession()) initializeCragSession(untrack(() => initialSession));

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

		if (activeTool === 'track' && ['select', 'delete'].includes(trackDraftMode) && currentTrackPoints.length > 0) {
			if (trackDraftMode === 'select') trackEditor.clearTrackSelection();
			return;
		}

		const canSelectPathFromTool = activeTool !== 'track' || (!routeEditDraft && currentTrackPoints.length === 0);
		if (canSelectPathFromTool) {
			const selectedPath = selectTool.handlePathMapClick(e, { editPath: activeTool === 'track' });
			if (selectedPath) return;
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

		if (activeTool === 'transit') {
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
			access: cragEditorState.access,
			routeDocuments: cragEditorState.routeDocuments,
			sectorStorageMoves: cragEditorState.sectorStorageMoves,
			hierarchyEntries: cragEditorState.hierarchyEntries,
			activeMetadataTarget: cragEditorState.activeMetadataTarget
		});

		if (sessionString) {
			clearTimeout(autosaveSessionTimeout);
			autosaveSessionTimeout = setTimeout(saveLatestCragSession, 1000);
		}
	});

	$effect(() => {
		const target = cragEditorState.activeMetadataTarget;
		if (selectedObject?.type === 'entry' && target?.type === 'entry' && selectedObject.key !== target.key)
			selectedObject = { type: 'entry', key: target.key };
		if (selectedObject?.type === 'sector' && target?.type === 'sector' && selectedObject.id !== target.id)
			selectedObject = { type: 'sector', id: target.id };
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		syncEditorData();
		JSON.stringify(cragEditorState.activeMetadataTarget);
		JSON.stringify(cragEditorState.getMetadataTarget()?.geometry || null);
		activeTool;
		untrack(() => {
			geometryEditor.syncDrawing();
			const currentCenter = getGeometryCenter(cragEditorState.crag.geometry);
			if (cragMarker && currentCenter) cragMarker.setLngLat(currentCenter);
		});
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
		untrack(() => {
			syncSectorMarkers();
			syncEditorData();
			geometryEditor.syncDrawing();
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

	function centerMapOnUser() {
		if (!navigator.geolocation || !map) return;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinates = [position.coords.longitude, position.coords.latitude];
				map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 15), duration: 500 });
			},
			() => {},
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
		);
	}

	function initMarkersAndLayers(loadedMap = map) {
		if (!loadedMap) return;
		map = loadedMap;
		sectorTool.ensureMapLayers(loadedMap);
		ensureCragEditorLayers(loadedMap);
		geometryEditor.ensureMapLayers(loadedMap);

		const markerPos = $state.snapshot(getGeometryCenter(cragEditorState.crag.geometry) || [0, 0]);
		if (cragMarker) cragMarker.remove();
		cragMarker = new maplibregl.Marker({
				element: createIconMarkerElement({
				className: 'crag-marker cursor-pointer',
				iconUrl: `${base}/icons/sports-climbing.png`,
				size: getMapMarkerSize(32)
			}),
			draggable: false
		})
			.setLngLat(markerPos)
			.addTo(loadedMap);
		cragMarker.getElement().addEventListener('click', (event) => {
			event.stopPropagation();
			const current = cragEditorState.hierarchyEntries.find((entry) => entry.isCurrent);
			if (current) selectMetadataTarget({ type: 'entry', key: current.key }, { focus: false });
		});

		syncSectorMarkers();
		accessEditor.syncAccessMarkers();

		trackEditor.initTrackPointDragHandlers();
		initTrackCutDragHandlers();
		initTrackViewportSyncHandlers();
		geometryEditor.initHandlers(loadedMap);
		accessEditor.initDetectionPointHandlers();
		syncEditorData();
		syncTrackCutOverlay();
		syncTrackDragOverlay();
	}

	function syncEditorData() {
		// Sector geometry has its own source. Keep it synchronized even while the
		// shared route/access source is being recreated after a map style change.
		sectorTool.syncDrawing();
		geometryEditor.syncDrawing();
		const source = map?.getSource('crag-editor-data');
		if (!source) return;
		const drawingPoints = $state.snapshot(currentTrackPoints) || [];
		const editingRoutePath = routeEditDraft || null;
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
					(document.data?.paths?.features || []).map((feature, pathIndex) => ({
						documentPath: document.path,
						pathIndex,
						feature,
						assignedRouteIds: (document.data?.routes || [])
							.filter((route) =>
								(route.pathRefs || []).some((ref) => String(ref.pathId) === String(feature.id))
							)
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

	function cragFolder({ path, id }) {
		return [path, id].filter(Boolean).join('/');
	}

	async function tryRenameFile(oldPath, newPath) {
		try {
			await renameFile(oldPath, newPath);
		} catch (err) {
			console.warn(`Could not rename ${oldPath} to ${newPath}:`, err);
		}
	}

	async function migrateCragStorage(source, target) {
		if (!source?.id) return;
		const oldFolder = cragFolder(source);
		const newFolder = cragFolder(target);
		if (!oldFolder || oldFolder === newFolder) return;

		await renameFile(oldFolder, newFolder);

		if (source.id !== target.id) {
			await tryRenameFile(`${newFolder}/${source.id}.json`, `${newFolder}/${target.id}.json`);
			await tryRenameFile(`${newFolder}/${source.id}-access.json`, `${newFolder}/${target.id}-access.json`);
			await tryRenameFile(`${newFolder}/${source.id}-topo.json`, `${newFolder}/${target.id}-topo.json`);
			await tryRenameFile(`${newFolder}/${source.id}.glb`, `${newFolder}/${target.id}.glb`);
		}
	}

	function updateAssetPathForMove(asset, source, target) {
		if (!asset?.path || !source?.id) return asset;
		const oldPrefix = `${cragFolder(source)}/`;
		const newPrefix = `${cragFolder(target)}/`;
		return asset.path.startsWith(oldPrefix)
			? { ...asset, path: `${newPrefix}${asset.path.slice(oldPrefix.length)}` }
			: asset;
	}

	function updateAssetCollectionsForMove(assets, source, target) {
		if (!assets) return assets;
		return Object.fromEntries(
			Object.entries(assets).map(([key, value]) => [
				key,
				Array.isArray(value) ? value.map((asset) => updateAssetPathForMove(asset, source, target)) : value
			])
		);
	}

	function updateRouteDocumentsForMove(source, target) {
		if (!source?.id) return;
		const oldFolder = cragFolder(source);
		const newFolder = cragFolder(target);
		if (oldFolder === newFolder) return;

		for (const document of cragEditorState.routeDocuments) {
			const sectorTopo = new Topo(target.path, target.id, document.sectorId || undefined);
			document.path = sectorTopo.getTopoPath();
			if (document.data?.crag_id) document.data.crag_id = target.id;
			document.dirty = document.dirty || source.id !== target.id;
		}
		if (cragEditorState.selectedRouteKey?.startsWith(`${oldFolder}/`)) {
			cragEditorState.selectedRouteKey = cragEditorState.selectedRouteKey.replace(oldFolder, newFolder);
		}
	}

	function remapFolderPrefix(value, oldFolder, newFolder) {
		if (!value || !oldFolder) return value;
		if (value === oldFolder) return newFolder;
		return value.startsWith(`${oldFolder}/`) ? `${newFolder}${value.slice(oldFolder.length)}` : value;
	}

	async function migrateHierarchyEntryStorage(entry) {
		const source = { ...entry.source };
		const target = { path: source.path, id: entry.feature.id };
		if (!target.id || source.id === target.id) return;

		const oldFolder = cragFolder(source);
		const newFolder = cragFolder(target);
		await migrateCragStorage(source, target);

		const keyMap = new Map();
		for (const candidate of cragEditorState.hierarchyEntries) {
			const oldKey = candidate.key;
			const previousSourcePath = candidate.source.path;
			const nextSourcePath = remapFolderPrefix(previousSourcePath, oldFolder, newFolder);
			candidate.source.path = nextSourcePath;
			candidate.feature.path = remapFolderPrefix(candidate.feature.path, oldFolder, newFolder);
			if (candidate === entry) candidate.source.id = target.id;
			if (nextSourcePath !== previousSourcePath) candidate.dirty = true;
			candidate.key = cragFolder(candidate.source);
			keyMap.set(oldKey, candidate.key);
		}
		for (const candidate of cragEditorState.hierarchyEntries) {
			candidate.parentKey = keyMap.get(candidate.parentKey) || candidate.parentKey;
			candidate.childKeys = candidate.childKeys.map((key) => keyMap.get(key) || key);
		}
		if (cragEditorState.activeMetadataTarget?.type === 'entry') {
			const key = keyMap.get(cragEditorState.activeMetadataTarget.key);
			if (key) cragEditorState.activeMetadataTarget = { type: 'entry', key };
		}
		if (selectedObject?.type === 'entry') {
			const key = keyMap.get(selectedObject.key);
			if (key) selectedObject = { type: 'entry', key };
		}
		if (cragEditorState.sourceCrag) {
			cragEditorState.sourceCrag.path = remapFolderPrefix(
				cragEditorState.sourceCrag.path,
				oldFolder,
				newFolder
			);
		}
		cragEditorState.crag.path = remapFolderPrefix(
			cragEditorState.crag.path,
			oldFolder,
			newFolder
		);
		for (const document of cragEditorState.routeDocuments) {
			document.path = remapFolderPrefix(document.path, oldFolder, newFolder);
		}
		if (cragEditorState.selectedRouteKey) {
			cragEditorState.selectedRouteKey = remapFolderPrefix(
				cragEditorState.selectedRouteKey,
				oldFolder,
				newFolder
			);
		}
	}

	function hierarchyParentRef(folder) {
		const parts = String(folder || '').split('/').filter(Boolean);
		if (!parts.length) return null;
		return { path: parts.slice(0, -1).join('/'), id: parts.at(-1) };
	}

	function updateParentChildSummary(entry, child, { remove = false, previousId = null } = {}) {
		const children = entry.feature.sectors || [];
		const existingIndex = children.findIndex(
			(sector) => sector.id === child.id || (remove && sector.id === previousId)
		);
		if (remove) {
			if (existingIndex < 0) return false;
			entry.feature.sectors = children.filter((_, index) => index !== existingIndex);
		} else if (existingIndex < 0) {
			entry.feature.sectors = [...children, child];
		} else {
			entry.feature.sectors[existingIndex] = { ...children[existingIndex], ...child };
		}
		entry.dirty = true;
		return true;
	}

	async function updateRemoteParentChildSummary(folder, child, options = {}) {
		const ref = hierarchyParentRef(folder);
		if (!ref) return;
		const loadedEntry = cragEditorState.hierarchyEntries.find(
			(entry) => cragFolder(entry.source) === folder
		);
		if (loadedEntry) {
			updateParentChildSummary(loadedEntry, child, options);
			return;
		}

		let feature;
		try {
			feature = await readJson(new Topo(ref.path, ref.id).getCragPath());
		} catch {
			if (options.remove) return;
			feature = {
				type: 'Feature',
				properties: {
					id: ref.id,
					name: ref.id,
					kind: 'area',
					sectors: []
				},
				geometry: cragEditorState.crag.geometry
			};
		}
		const { type: _type, properties = {}, geometry, ...featureExtras } = feature;
		const { path: _path, ...persistedProperties } = properties;
		const children = properties.sectors || [];
		const existingIndex = children.findIndex(
			(sector) => sector.id === child.id || (options.remove && sector.id === options.previousId)
		);
		const nextChildren = options.remove
			? children.filter((_, index) => index !== existingIndex)
			: existingIndex < 0
				? [...children, child]
				: children.map((sector, index) => (index === existingIndex ? { ...sector, ...child } : sector));
		if (options.remove && existingIndex < 0) return;
		await writeJson(new Topo(ref.path, ref.id).getCragPath(), {
			...featureExtras,
			type: 'Feature',
			properties: { ...persistedProperties, id: persistedProperties.id || ref.id, sectors: nextChildren },
			geometry
		});
	}

	async function syncCragPlacement(source, target) {
		if (!source?.id || source.path === target.path) return;
		const child = {
			id: target.id,
			name: cragEditorState.crag.name,
			kind: cragEditorState.crag.kind || 'crag'
		};
		await updateRemoteParentChildSummary(source.path, child, {
			remove: true,
			previousId: source.id
		});
		await updateRemoteParentChildSummary(target.path, child);
	}

	async function migrateSectorStorageMoves(target) {
		const root = cragFolder(target);
		for (const move of cragEditorState.sectorStorageMoves) {
			if (!move.from || !move.to || move.from === move.to) continue;
			const oldFolder = `${root}/${move.from}`;
			const newFolder = `${root}/${move.to}`;
			// New sectors can be renamed before their first save, in which case there
			// is no source folder to move yet. The subsequent writes create the target.
			await tryRenameFile(oldFolder, newFolder);
			for (const suffix of ['.json', '-topo.json', '-access.json', '.glb']) {
				await tryRenameFile(`${newFolder}/${move.from}${suffix}`, `${newFolder}/${move.to}${suffix}`);
			}
			const sector = cragEditorState.crag.sectors.find((item) => item.id === move.to);
			for (const assets of Object.values(sector?.assets || {})) {
				if (!Array.isArray(assets)) continue;
				for (const asset of assets) {
					if (!asset?.path?.startsWith(`${newFolder}/${move.to}`)) continue;
					const oldPath = `${newFolder}/${move.from}${asset.path.slice(`${newFolder}/${move.to}`.length)}`;
					await tryRenameFile(oldPath, asset.path);
				}
			}
		}
	}

	async function uploadMetadataImages(metadata, metadataTopo) {
		const uploadedImages = [];
		for (let i = 0; i < (metadata.assets?.images || []).length; i++) {
			const image = metadata.assets.images[i];
			if (image._file) {
				const imagePath = metadataTopo.getImagePath(image.name, i);
				await writeFile(imagePath, image._file, image.type || image._file.type);
				uploadedImages.push({
					name: image.name,
					path: imagePath,
					type: image.type,
					size: image.size
				});
			} else {
				uploadedImages.push({
					name: image.name,
					path: image.path,
					type: image.type,
					size: image.size
				});
			}
		}
		metadata.assets = { ...(metadata.assets || {}), images: uploadedImages };
	}

	async function saveToServer() {
		if (!authState.requireAuth(() => saveToServer())) return;
		if (cragEditorState.hierarchyErrors.length) {
			saveStatus = 'error';
			saveError = cragEditorState.hierarchyErrors[0].message;
			return;
		}

		saveStatus = 'saving';
		saveError = '';

		try {
			if (!cragEditorState.crag.id) {
				cragEditorState.setCragField('id', slugifyName(cragEditorState.crag.name));
			}
			for (const entry of cragEditorState.hierarchyEntries) {
				if (!entry.isCurrent && entry.dirty) await migrateHierarchyEntryStorage(entry);
			}
			const savePath = cragEditorState.crag.path;
			const targetCrag = { path: savePath, id: cragEditorState.crag.id };
			const sourceCrag = cragEditorState.sourceCrag;
			const currentHierarchyEntry = cragEditorState.hierarchyEntries.find((entry) => entry.isCurrent);
			const shouldSaveCurrent = !currentHierarchyEntry || currentHierarchyEntry.dirty;
			if (shouldSaveCurrent) {
				await migrateCragStorage(sourceCrag, targetCrag);
				updateRouteDocumentsForMove(sourceCrag, targetCrag);
				await syncCragPlacement(sourceCrag, targetCrag);
			}

			const topo = new Topo(savePath, cragEditorState.crag.id);
			if (!cragEditorState.crag.assets) cragEditorState.crag.assets = { images: [] };
			if (!cragEditorState.crag.assets.images) cragEditorState.crag.assets.images = [];
			if (shouldSaveCurrent) cragEditorState.crag.assets = updateAssetCollectionsForMove(
				cragEditorState.crag.assets,
				sourceCrag,
				targetCrag
			);
			if (shouldSaveCurrent) cragEditorState.crag.sectors = (cragEditorState.crag.sectors || []).map((sector) => ({
				...sector,
				assets: updateAssetCollectionsForMove(sector.assets, sourceCrag, targetCrag)
			}));
			if (shouldSaveCurrent) await migrateSectorStorageMoves(targetCrag);
			if (shouldSaveCurrent) {
				await uploadMetadataImages(cragEditorState.crag, topo);
				for (const sector of cragEditorState.crag.sectors || []) {
					if (sector.id) await uploadMetadataImages(sector, new Topo(savePath, cragEditorState.crag.id, sector.id));
				}
			}
			for (const entry of cragEditorState.hierarchyEntries) {
				if (!entry.isCurrent && entry.dirty) await uploadMetadataImages(entry.feature, new Topo(entry.source.path, entry.source.id));
			}
			const sectors = $state.snapshot(cragEditorState.crag.sectors) || [];

			if (shouldSaveCurrent) {
				const { path: _path, ...properties } = $state.snapshot(cragEditorState.crag);
				await writeJson(topo.getCragPath(), {
					...(currentHierarchyEntry?.featureExtras || {}),
					type: 'Feature',
					properties: {
						...properties,
						kind: cragEditorState.crag.kind,
						sectors: sectors.map(({ id, name, kind }) => ({ id, name, kind })),
						id: cragEditorState.crag.id,
						updated: new Date().toISOString().split('T')[0]
					},
					geometry: cragEditorState.crag.geometry
				});
			}

			for (const sector of shouldSaveCurrent ? sectors : []) {
				if (!sector.id) continue;
				const sectorTopo = new Topo(savePath, cragEditorState.crag.id, sector.id);
				const { geometry, path: _path, ...properties } = sector;
				await writeJson(sectorTopo.getSectorPath(), {
					type: 'Feature',
					properties: { ...properties, kind: properties.kind || 'sector' },
					geometry
				});
			}

			for (const entry of cragEditorState.hierarchyEntries) {
				if (!entry.dirty || entry.isCurrent) continue;
				const entryTopo = new Topo(entry.source.path, entry.source.id);
				const {
					geometry,
					sectors: children = [],
					path: _path,
					...properties
				} = $state.snapshot(entry.feature);
				await writeJson(entryTopo.getCragPath(), {
					...(entry.featureExtras || {}),
					type: 'Feature',
					properties: {
						...properties,
						sectors: children.map(({ id, name, kind }) => ({ id, name, kind }))
					},
					geometry
				});
				entry.dirty = false;
			}

			if (shouldSaveCurrent) await writeJson(topo.getAccessPath(), $state.snapshot(cragEditorState.access));

			for (const document of cragEditorState.routeDocuments) {
				if (document.dirty) await writeJson(document.path, document.data);
				document.dirty = false;
			}
			cragEditorState.sectorStorageMoves = [];

			cragEditorState.sourceCrag = targetCrag;
			const currentEntry = cragEditorState.hierarchyEntries.find((entry) => entry.isCurrent);
			if (currentEntry) currentEntry.dirty = false;
			saveLatestCragSession();
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
		const target = cragEditorState.getMetadataTarget();
		cragEditorState.setMetadataEquipment(addEquipment(target?.equipment || []));
	}

	function removeEquipmentItem(idx) {
		const target = cragEditorState.getMetadataTarget();
		cragEditorState.setMetadataEquipment(removeEquipment(target?.equipment || [], idx));
	}

	function ensureMetadataAssets() {
		const target = cragEditorState.getMetadataTarget();
		if (!target) return null;
		if (!target.assets) target.assets = { images: [] };
		if (!target.assets.images) target.assets.images = [];
		return target;
	}

	function addCragImages(files = []) {
		const target = ensureMetadataAssets();
		if (!target) return;
		const images = files
			.filter((file) => file?.type?.startsWith('image/'))
			.map((file) => ({
				name: file.name,
				type: file.type,
				size: file.size,
				previewUrl: URL.createObjectURL(file),
				_file: file
			}));
		cragEditorState.setMetadataImages([...target.assets.images, ...images]);
	}

	function removeCragImage(index) {
		const target = ensureMetadataAssets();
		if (!target) return;
		const image = target.assets.images[index];
		if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
		cragEditorState.setMetadataImages(target.assets.images.filter((_, i) => i !== index));
	}

	function setActiveMetadataId(value) {
		const target = cragEditorState.activeMetadataTarget;
		cragEditorState.setMetadataField('id', value);
		if (target?.type === 'sector' && selectedObject?.type === 'sector' && selectedObject.id === target.id) {
			selectedObject = { type: 'sector', id: value };
		}
	}

	function getCragTrackFeature(target) {
		if (target?.kind === 'access')
			return (
				cragEditorState.access.features.find((feature) => feature.id === target.featureId) || null
			);
		if (target?.kind === 'route-path')
			return (
				cragEditorState.routeDocuments
					.find((entry) => entry.path === target.documentPath)
					?.data?.paths?.features?.find(
						(feature) => String(feature.id) === String(target.pathId)
					) || null
			);
		return null;
	}

	function saveCragTrackGeometry(target, coordinates) {
		if (target?.kind === 'route-path')
			return Boolean(routeTool.saveRoutePathCoordinates(target, coordinates));
		if (target?.kind !== 'access') return false;
		cragEditorState.replaceAccessFeatures(
			cragEditorState.access.features.map((feature) =>
				feature.id === target.featureId
					? { ...feature, geometry: { type: 'LineString', coordinates } }
					: feature
			)
		);
		return true;
	}

	function undoCragEdit() {
		return cragEditorState.canUndo ? cragEditorState.undo() : routeTool.undoDeleteRoutePath();
	}

	provideCragEditorTools({
		trackEditor,
		sectorTool,
		geometryEditor,
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
			setActiveMetadataId,
			selectMetadataTarget,
			handleFlightPlanGenerated
		}
	});
</script>

<CragEditorMap
	bind:map
	bind:isMapLoaded
	bind:mapStyle
	initialCoordinates={$state.snapshot(getGeometryCenter(cragEditorState.crag.geometry) || [0, 0])}
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
/>

<RouteDetailModal routeEntry={selectedRouteEntry} onClose={() => selectObject(null)} />

{#if activeTool === 'cut' && cutLineEnd && !pendingTrackCut}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		No intersection found. Click again to start a new cut line.
	</div>
{/if}
