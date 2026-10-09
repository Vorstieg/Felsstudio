<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import type {
		GeoJSONSource,
		Map as MapLibreMap,
		MapMouseEvent,
		Marker,
		PointLike
	} from 'maplibre-gl';
	import type { Feature, FeatureCollection } from 'geojson';
	import type { FelsEntryWorkspace } from '$lib/types/crag';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import {
		createCragEditorSession,
		createFelsEntry,
		createImageToken,
		provideCragEditorSession,
		snapshotDraftWorkspace
	} from '$lib/state/crag-session.svelte.ts';
	import { provideCragEditorTools } from '$lib/state/crag-controller-context.svelte.ts';
	import { viewport } from '$lib/state/viewport.svelte.ts';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import CragEditorLayout from '$lib/components/editor/crag/CragEditorLayout.svelte';
	import RouteDetailModal from '$lib/components/editor/crag/RouteDetailModal.svelte';
	import { authState } from '$lib/api/auth.svelte.ts';
	import { storage } from '$lib/assets/js/storage-utils.ts';
	import { Topo } from '$lib/assets/js/topo-paths.ts';
	import {
		workspaceDocumentPaths,
		workspaceNodeDocumentPaths
	} from '$lib/assets/js/workspace-paths.ts';
	import { loadFelsEntryWorkspaceDetails } from '$lib/assets/js/load-crag-editor-entry.ts';
	import { saveCragWorkspace } from '$lib/assets/js/save-crag-workspace.ts';
	import {
		addEquipment,
		removeEquipment
	} from '$lib/components/editor/crag/crag-editor-equipment.ts';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.ts';
	import type {
		AccessTrackFeature,
		ActiveTrackTarget,
		RoutePathTarget
	} from '$lib/components/editor/crag/use-crag-track-editor.svelte.ts';
	import { createCragRouteTool } from '$lib/components/editor/crag/CragRouteTool.svelte.ts';
	import type { CragSelection } from '$lib/components/editor/crag/crag-route-types.ts';
	import { createCragSelectTool } from '$lib/components/editor/crag/CragSelectTool.svelte.ts';
	import { createCragSectorTool } from '$lib/components/editor/crag/CragSectorTool.svelte.ts';
	import { useCragGeometryEditor } from '$lib/components/editor/crag/use-crag-geometry-editor.svelte.ts';
	import { useCragSectorMarkers } from '$lib/components/editor/crag/use-crag-sector-markers.svelte.ts';
	import { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.ts';
	import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.ts';
	import {
		createIconMarkerElement,
		ensureCragEditorLayers,
		syncFlightPlanPreview
	} from '$lib/components/editor/crag/crag-editor-map.ts';
	import type { FlightPlan } from '$lib/assets/js/flight-plan-types.ts';
	import { buildEditorFeatureCollection } from '$lib/components/editor/crag/crag-editor-data.ts';
	import { getMapHitRadius, getMapMarkerSize } from '$lib/assets/js/mobile-utils.ts';
	import { createRouteEditController } from './route-editing.ts';
	import { getGeometryCenter } from '$lib/assets/js/sector-utils.ts';
	import type { Point2D } from '@vorstieg/fels-types/types';

	type Point2 = [number, number];
	type Selection = CragSelection;
	type RoutePathDraft = RoutePathTarget;
	type TrackCut = { startCoordinates: Point2[]; endCoordinates: Point2[]; intersection: Point2 };
	type DraftSession = {
		workspace: FelsEntryWorkspace;
		activeWorkspaceEntryPath: string | null;
		activeMetadataTarget?: string | null;
	};
	let {
		inspectorShadow = true,
		initialSession = null
	}: { inspectorShadow?: boolean; initialSession?: DraftSession | null } = $props();
	const cragEditorState = provideCragEditorSession(createCragEditorSession());

	// Layout flags
	let isExpanded = $derived(viewport.isExpanded);

	let map = $state<MapLibreMap | null>(null);
	let cragMarker: Marker | null = null;
	let mapStyle = $state<'transport' | 'satellite' | 'terrain'>('transport');
	let isMapLoaded = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
	let saveError = $state('');

	let activeTool = $state('select'); // 'select' | 'geometry' | 'transit' | 'parking' | 'hut' | 'track'
	let toolOptionsOpen = $state(false);
	let activeTab = $state('info'); // 'info' | 'registry'
	let selectedObject = $state<Selection | null>(null);
	// Preview state is replaced whenever the user generates another mission.
	let flightPlan = $state<FlightPlan | null>(null);
	let routeTool: ReturnType<typeof createCragRouteTool>;
	let geometryEditor: ReturnType<typeof useCragGeometryEditor>;
	let activeWorkspace = $derived(cragEditorState.getActiveWorkspaceEntry());
	let activeEntry = $derived(activeWorkspace?.entry || null);
	let activeSectors = $derived(activeWorkspace?.childEntries || []);
	let activeAccess = $derived(
		activeWorkspace?.access || { type: 'FeatureCollection', version: 1, features: [] }
	);
	let workspaceTopos = $derived.by(() =>
		[activeWorkspace, ...activeSectors].flatMap((node) =>
			node?.entry?.properties.id && node.topo
				? [
						{
							node,
							path: workspaceNodeDocumentPaths(node).topo,
							data: node.topo
						}
					]
				: []
		)
	);

	let selectedRouteEntry = $derived.by(() => {
		const selection = selectedObject;
		if (selection?.type !== 'route') return null;
		return (
			workspaceTopos
				.flatMap((document) => (document.data?.routes || []).map((route) => ({ document, route })))
				.find(({ document, route }) => `${document.path}:${route.id}` === selection.key) ?? null
		);
	});
	let routeEditDraft = $state<RoutePathDraft | null>(null);
	let isRoutePathDrawing = $derived(routeEditDraft !== null);
	let cutLineStart = $state<Point2 | null>(null);
	let cutLineEnd = $state<Point2 | null>(null);
	let pendingTrackCut = $state<TrackCut | null>(null);
	let hasPendingTrackCut = $derived(pendingTrackCut !== null);
	let areTrackCutDragHandlersReady = false;
	let areTrackViewportSyncHandlersReady = false;
	let suppressNextMapClick = false;
	let canAutosaveSession = $state(false);
	let autosaveSessionTimeout: ReturnType<typeof setTimeout> | undefined;
	let activeCragDraftId = $state<string | null>(null);
	const CRAG_DRAFTS_KEY = 'crag_editor_drafts_v1';
	const cragDraftSessionKey = (id: string) => `crag_editor_draft_session_${id}`;

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

	async function activateWorkspaceEntry(target: string) {
		if (!target || !cragEditorState.workspace) return;
		try {
			await loadFelsEntryWorkspaceDetails(cragEditorState.workspace, target);
		} catch (error) {
			saveStatus = 'error';
			saveError = `Could not load ${target}: ${error instanceof Error ? error.message : String(error)}`;
			return false;
		}
		saveError = '';
		if (!cragEditorState.getWorkspaceEntry(target)?.entry)
			cragEditorState.materializeWorkspaceEntry(target);
		cragEditorState.activeWorkspaceEntryPath = target;
		cragEditorState.setActiveMetadataTarget(target);
		return true;
	}

	async function selectObject(value: Selection | null) {
		if (value?.type === 'entry') {
			if (typeof value.key !== 'string' || !(await activateWorkspaceEntry(value.key))) return;
			activeTab = 'info';
		}
		routeEditController.selectObject(value);
	}

	async function selectMetadataTarget(
		target: string | null,
		{ focus = true, edit = false }: { focus?: boolean; edit?: boolean } = {}
	) {
		if (!target) return;
		await selectObject({ type: 'entry', key: target });
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

	const addTrackPoint = trackEditor.addTrackPoint;
	const handleTrackConfirm = trackEditor.handleTrackConfirm;
	const startRoutingDraft = trackEditor.startRoutingDraft;
	const undoTrackPoint = trackEditor.undoTrackPoint;
	const splitEditingTrack = trackEditor.splitEditingTrack;
	const editTrack = (...args: Parameters<typeof trackEditor.editTrack>) => {
		toolOptionsOpen = false;
		return trackEditor.editTrack(...args);
	};
	const editRoutePathTrack = (...args: Parameters<typeof trackEditor.editRoutePath>) => {
		toolOptionsOpen = false;
		return trackEditor.editRoutePath(...args);
	};
	const cancelTrackEdit = trackEditor.cancelTrackEdit;

	const accessEditor = useCragAccessEditor({
		state: cragEditorState,
		getMap: () => map,
		getIsMapLoaded: () => isMapLoaded,
		getActiveTool: () => activeTool
	});
	let detectedAssets = $derived(accessEditor.detectedAssets);
	let isDetectionLoading = $derived(accessEditor.isDetectionLoading);
	let isDetectionZoomLimited = $derived(accessEditor.isDetectionZoomLimited);
	const addDetectedAsset = accessEditor.addDetectedAsset;
	const addTransitPoint = accessEditor.addTransitPoint;
	const addParkingPoint = accessEditor.addParkingPoint;
	const addHutPoint = accessEditor.addHutPoint;

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
		getRouteDocuments: () => workspaceTopos,
		onEditRoutePath: (path, routeId, pathId) => routeTool.editRoutePath(path, routeId, pathId),
		onEditTrack: editTrack
	});

	function isBlankCragSession() {
		return !cragEditorState.workspace;
	}

	function restoreCragSession(session: DraftSession | null, id: string | null = null) {
		if (!session?.workspace) return false;
		cragEditorState.workspace = snapshotDraftWorkspace(session.workspace);
		cragEditorState.activeWorkspaceEntryPath = session.activeWorkspaceEntryPath;
		cragEditorState.activeMetadataTarget =
			session.activeMetadataTarget || session.activeWorkspaceEntryPath;
		selectedObject = cragEditorState.activeWorkspaceEntryPath
			? {
					type: 'entry',
					key: cragEditorState.activeWorkspaceEntryPath
				}
			: null;
		activeCragDraftId = id;
		return true;
	}

	function getCragDraftIdFromUrl() {
		if (typeof window === 'undefined') return null;
		return new URL(window.location.href).searchParams.get('draft');
	}

	function setCragDraftParamInUrl(id: string | null) {
		if (!id || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (url.searchParams.get('draft') === id) return;
		url.searchParams.set('draft', id);
		window.history.replaceState(window.history.state, '', url);
	}

	function createCragDraftId() {
		return activeEntry?.properties.id
			? `crag-${activeEntry.properties.id}`
			: `draft-crag-${Date.now()}`;
	}

	function getCragDraftSession(id: string) {
		return storage.get<DraftSession>(cragDraftSessionKey(id), null);
	}

	function saveLatestCragSession() {
		const workspace = cragEditorState.workspace;
		if (!workspace) return;
		const timestamp = new Date().toISOString();
		const id = activeCragDraftId || createCragDraftId();
		const session = {
			workspace: snapshotDraftWorkspace(workspace),
			activeWorkspaceEntryPath: cragEditorState.activeWorkspaceEntryPath,
			activeMetadataTarget: cragEditorState.activeMetadataTarget,
			updated: timestamp
		};
		const metadata = {
			id,
			name: activeEntry?.properties.name || 'Unnamed Crag',
			path: cragEditorState.activeWorkspaceEntryPath || '',
			cragId: activeEntry?.properties.id || '',
			updated: timestamp
		};
		const drafts = (storage.get<Array<{ id: string }>>(CRAG_DRAFTS_KEY, []) ?? []).filter(
			(draft) => draft.id !== id
		);
		storage.set(CRAG_DRAFTS_KEY, [metadata, ...drafts]);
		storage.set(cragDraftSessionKey(id), session);
		activeCragDraftId = id;
		setCragDraftParamInUrl(id);
	}

	function initializeCragSession(sourceSession: DraftSession | null) {
		const draftId = getCragDraftIdFromUrl();
		if (draftId && restoreCragSession(getCragDraftSession(draftId), draftId)) return;
		if (sourceSession && restoreCragSession(sourceSession)) return;
		const entry = createFelsEntry('crag', { id: 'new-crag', name: 'New Crag' });
		cragEditorState.workspace = {
			entry,
			id: entry.properties.id,
			path: '',
			childEntries: [],
			topo: null,
			access: null,
			dirtyPaths: [workspaceDocumentPaths('', entry.properties.id).entry],
			removedPaths: [],
			images: [],
			pendingImages: [],
			documentsLoaded: true,
			detailsLoaded: true
		};
		cragEditorState.activeWorkspaceEntryPath = entry.properties.id;
		cragEditorState.setActiveMetadataTarget(entry.properties.id);
		selectedObject = { type: 'entry', key: entry.properties.id };
	}

	function coordinatesEqual(a: Point2 | undefined, b: Point2): boolean {
		if (!a) return false;
		return Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
	}

	function segmentLineIntersection(
		a: Point2,
		b: Point2,
		c: Point2,
		d: Point2
	): { coordinate: Point2; t: number } | null {
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

	function findTrackCutIntersection(coordinates: Point2[], lineStart: Point2, lineEnd: Point2) {
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

	function splitTrackAtIntersection(
		coordinates: Point2[],
		intersection: { coordinate: Point2; segmentIndex: number }
	): [Point2[], Point2[]] {
		const { coordinate, segmentIndex } = intersection;
		const startCoordinates = coordinates.slice(0, segmentIndex + 1);
		const endCoordinates = coordinates.slice(segmentIndex + 1);
		if (!coordinatesEqual(startCoordinates.at(-1), coordinate)) startCoordinates.push(coordinate);
		if (!coordinatesEqual(endCoordinates[0], coordinate)) endCoordinates.unshift(coordinate);
		return [startCoordinates, endCoordinates];
	}

	function cutOverlayFeatures(): FeatureCollection {
		const features: Feature[] = [];
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
		const source = map?.getSource('track-cut-overlay') as GeoJSONSource | undefined;
		if (source) source.setData(cutOverlayFeatures());
	}

	function trackDragOverlayFeatures(): FeatureCollection {
		if (!activeTrackDragState) return { type: 'FeatureCollection', features: [] };
		const { pointIndex, coordinate } = activeTrackDragState;
		const features: Feature[] = [];
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
		const source = map?.getSource('tracks-drag-overlay') as GeoJSONSource | undefined;
		if (source) source.setData(trackDragOverlayFeatures());
	}

	function visibleDrawingPointIndexes(points: Point2[]): number[] {
		const bounds = map?.getBounds?.();
		if (!bounds) return [];
		const indexes: number[] = [];
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

	function handleTrackCutClick(coordinate: Point2) {
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
		const wasSplit = routeEditDraft
			? routeTool.splitRoutePath(
					routeEditDraft,
					pendingTrackCut.startCoordinates,
					pendingTrackCut.endCoordinates
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
				const coordinate: Point2 = [event.lngLat.lng, event.lngLat.lat];
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

		const handleKeyDown = (e: KeyboardEvent) => {
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

	async function handleMapClick(e: MapMouseEvent) {
		if (!map) return;
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

		if (
			activeTool === 'track' &&
			['select', 'delete'].includes(trackDraftMode) &&
			currentTrackPoints.length > 0
		) {
			if (trackDraftMode === 'select') trackEditor.clearTrackSelection();
			return;
		}

		const canSelectPathFromTool =
			activeTool !== 'track' || (!routeEditDraft && currentTrackPoints.length === 0);
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
			const features = map.queryRenderedFeatures(bbox as [PointLike, PointLike], {
				layers: ['detection-points']
			});
			if (features.length > 0) {
				const distanceTo = (feature: (typeof features)[number]) =>
					feature.geometry.type === 'Point'
						? turf.distance(
								turf.point(e.lngLat.toArray()),
								turf.point(feature.geometry.coordinates)
							)
						: Infinity;
				const closest = features.reduce((prev, curr) => {
					const prevDist = distanceTo(prev);
					const currDist = distanceTo(curr);
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

		let lngLat: Point2 = [e.lngLat.lng, e.lngLat.lat];
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
			workspace: cragEditorState.workspace,
			activeWorkspaceEntryPath: cragEditorState.activeWorkspaceEntryPath,
			activeMetadataTarget: cragEditorState.activeMetadataTarget
		});

		if (sessionString) {
			clearTimeout(autosaveSessionTimeout);
			autosaveSessionTimeout = setTimeout(saveLatestCragSession, 1000);
		}
	});

	$effect(() => {
		const target = cragEditorState.activeMetadataTarget;
		if (selectedObject?.type === 'entry' && target && selectedObject.key !== target)
			selectedObject = { type: 'entry', key: target };
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		syncEditorData();
		JSON.stringify(cragEditorState.activeMetadataTarget);
		JSON.stringify(cragEditorState.getMetadataTarget()?.geometry || null);
		activeTool;
		untrack(() => {
			geometryEditor.syncDrawing();
			const currentCenter = getGeometryCenter(activeEntry?.geometry);
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
		JSON.stringify(activeSectors);
		JSON.stringify(workspaceTopos);
		selectedObject;
		untrack(() => {
			syncSectorMarkers();
			syncEditorData();
			geometryEditor.syncDrawing();
		});
	});

	$effect(() => {
		const tool = activeTool;
		if (tool === 'parking' || tool === 'transit' || tool === 'hut') {
			untrack(() => accessEditor.startNearbyAssetScan(tool));
		} else {
			untrack(() => accessEditor.clearDetectedAssets());
		}
	});

	$effect(() => {
		if (!isMapLoaded || !map) return;
		accessEditor.syncDetectionHighlights();
	});

	function snapToNearestWay(point: { x: number; y: number }, originalLngLat: Point2): Point2 {
		if (!map) return originalLngLat;
		const activeMap = map;
		const layers = [
			'Path',
			'Track',
			'Minor road',
			'Minor road outline',
			'Main road',
			'Highway',
			'Road construction',
			'snap-helper'
		].filter((id) => activeMap.getLayer(id));
		const features = activeMap.queryRenderedFeatures(
			[
				[point.x - 20, point.y - 20],
				[point.x + 20, point.y + 20]
			],
			{ layers }
		);
		if (features.length === 0) return originalLngLat;
		let closestPoint: Point2 | null = null;
		let minDistance = Infinity;
		features.forEach((feature) => {
			if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
				const lines =
					feature.geometry.type === 'LineString'
						? [feature.geometry.coordinates]
						: feature.geometry.coordinates;
				for (const coordinates of lines) {
					if (coordinates.length < 2) continue;
					const snapped = turf.nearestPointOnLine(
						turf.lineString(coordinates),
						turf.point(originalLngLat)
					);
					const dist = turf.distance(turf.point(originalLngLat), snapped);
					if (dist < minDistance) {
						minDistance = dist;
						closestPoint = [snapped.geometry.coordinates[0], snapped.geometry.coordinates[1]];
					}
				}
			}
		});
		return closestPoint || originalLngLat;
	}

	function centerMapOnUser() {
		if (!navigator.geolocation || !map) return;
		const activeMap = map;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const coordinates: Point2 = [position.coords.longitude, position.coords.latitude];
				activeMap.easeTo({
					center: coordinates,
					zoom: Math.max(activeMap.getZoom(), 15),
					duration: 500
				});
			},
			() => {},
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
		);
	}

	function initMarkersAndLayers(loadedMap: MapLibreMap | null = map) {
		if (!loadedMap) return;
		map = loadedMap;
		sectorTool.ensureMapLayers(loadedMap);
		ensureCragEditorLayers(loadedMap);
		geometryEditor.ensureMapLayers(loadedMap);

		const markerPos: [number, number] = $state.snapshot(
			getGeometryCenter(activeEntry?.geometry) || ([0, 0] as [number, number])
		);
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
			if (cragEditorState.activeWorkspaceEntryPath)
				selectMetadataTarget(cragEditorState.activeWorkspaceEntryPath, { focus: false });
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
		const source = map?.getSource('crag-editor-data') as GeoJSONSource | undefined;
		if (!source) return;
		const drawingPoints = $state.snapshot(currentTrackPoints) || [];
		const editingRoutePath = routeEditDraft || null;
		source.setData(
			buildEditorFeatureCollection({
				savedAccessFeatures: $state.snapshot(activeAccess.features) || [],
				routePaths: workspaceTopos.flatMap((document) =>
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
				draggingTrackPointIndex: untrack(() => activeTrackDragState?.pointIndex ?? null)
			})
		);
		syncFlightPlanPreview(map, $state.snapshot(flightPlan));
	}

	function handleFlightPlanGenerated(plan: FlightPlan | null) {
		flightPlan = plan;
		syncEditorData();
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
			if (!cragEditorState.workspace) throw new Error('No entry workspace is open.');
			try {
				await saveCragWorkspace(cragEditorState.workspace, {
					getPendingImages: (node) => cragEditorState.getPendingImages(node),
					finishUpload: (node, image) => cragEditorState.removePendingImage(node, image.clientId)
				});
			} finally {
				// A failed save may have completed earlier operations on the server.
				cragEditorState.clearHistory();
			}
			saveLatestCragSession();
			saveStatus = 'success';
			setTimeout(() => {
				if (saveStatus === 'success') saveStatus = 'idle';
			}, 3000);
		} catch (err) {
			console.error('Save failed:', err);
			saveStatus = 'error';
			saveError = err instanceof Error ? err.message : String(err);
		}
	}

	function addEquipmentItem() {
		const target = cragEditorState.getMetadataTarget();
		cragEditorState.setMetadataEquipment(addEquipment(target?.equipment || []));
	}

	function removeEquipmentItem(idx: number) {
		const target = cragEditorState.getMetadataTarget();
		cragEditorState.setMetadataEquipment(removeEquipment(target?.equipment || [], idx));
	}

	function getActiveImageWorkspace() {
		return cragEditorState.getWorkspaceEntry();
	}

	function addCragImages(files: File[] = []) {
		const node = getActiveImageWorkspace();
		const entry = node?.entry;
		if (!node || !entry) return;
		const uploads = files
			.filter((file) => file?.type?.startsWith('image/'))
			.map((file) => {
				const imagePath = new Topo(node.path, entry.properties.id).getImagePath(
					file.name,
					createImageToken()
				);
				return {
					file,
					previewUrl: URL.createObjectURL(file),
					path: imagePath,
					clientId: createImageToken()
				};
			});
		if (!uploads.length) return;
		cragEditorState.commit('Add images', () => {
			node.images = [
				...(node.images || []),
				...uploads.map(({ file, path, clientId }) => ({
					name: file.name,
					path,
					clientId
				}))
			];
			for (const upload of uploads) cragEditorState.addPendingImage(node, upload);
		});
	}

	function removeCragImage(index: number) {
		const node = getActiveImageWorkspace();
		if (!node) return;
		const images = node.images || [];
		const image = images[index];
		if (!image) return;
		cragEditorState.commit('Remove image', () => {
			if (
				!cragEditorState
					.getPendingImages(node)
					.some((pending) => pending.clientId === image.clientId)
			)
				node.removedPaths.push(image.sourcePath || image.path);
			node.images = images.filter((_, i) => i !== index);
			node.pendingImages = cragEditorState.getPendingImages(node);
		});
	}

	function setActiveMetadataId(value: string) {
		const target = cragEditorState.activeMetadataTarget;
		const node = cragEditorState.getWorkspaceEntry(target);
		cragEditorState.setMetadataField('id', value);
		if (selectedObject?.type === 'entry' && target && selectedObject.key === target && node)
			selectedObject = { type: 'entry', key: cragEditorState.getWorkspaceEntryPath(node) };
	}

	function getCragTrackFeature(target: ActiveTrackTarget | null): AccessTrackFeature | null {
		if (target?.kind !== 'access') return null;
		return (
			(activeAccess.features as AccessTrackFeature[]).find(
				(feature) => feature.id === target.featureId
			) ?? null
		);
	}

	function saveCragTrackGeometry(
		target: ActiveTrackTarget | null,
		coordinates: Point2D[]
	): boolean {
		if (target?.kind === 'route-path')
			return Boolean(routeTool.saveRoutePathCoordinates(target, coordinates));
		if (target?.kind !== 'access') return false;
		cragEditorState.replaceAccessFeatures(
			(activeAccess.features as AccessTrackFeature[]).map((feature) =>
				feature.id === target.featureId
					? { ...feature, geometry: { type: 'LineString', coordinates } }
					: feature
			)
		);
		return true;
	}

	function undoCragEdit() {
		return cragEditorState.undo();
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
			selectObject,
			selectMetadataTarget,
			handleFlightPlanGenerated
		}
	});
</script>

<CragEditorMap
	bind:map
	bind:isMapLoaded
	{mapStyle}
	initialCoordinates={$state.snapshot(getGeometryCenter(activeEntry?.geometry) || [0, 0])}
	onStyleLoad={initMarkersAndLayers}
	onMapClick={handleMapClick}
/>

<CragEditorLayout
	{inspectorShadow}
	{map}
	{isExpanded}
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
