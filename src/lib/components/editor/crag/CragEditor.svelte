<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount, untrack } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import type {
		GeoJSONSource,
		Map as MapLibreMap,
		MapMouseEvent,
		Marker,
		PointLike
	} from 'maplibre-gl';
	import type { FelsEntryWorkspace } from '$lib/types/crag';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import { snapToNearestWay } from '../track/track-snapping.ts';
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
	import { createCragTrackPersistence } from './create-crag-track-persistence.ts';
	import { useCragTrackEditor } from '$lib/components/editor/crag/use-crag-track-editor.svelte.ts';
	import type { RoutePathTarget } from './crag-track-types.ts';
	import { createCragRouteTool } from '$lib/components/editor/crag/CragRouteTool.svelte.ts';
	import type { CragSelection } from '$lib/components/editor/crag/crag-route-types.ts';
	import { createCragSelectTool } from '$lib/components/editor/crag/CragSelectTool.svelte.ts';
	import { createCragSectorTool } from '$lib/components/editor/crag/CragSectorTool.svelte.ts';
	import { useCragGeometryEditor } from '$lib/components/editor/crag/use-crag-geometry-editor.svelte.ts';
	import { useCragSectorMarkers } from '$lib/components/editor/crag/use-crag-sector-markers.svelte.ts';
	import { useCragAccessEditor } from '$lib/components/editor/crag/use-crag-access-editor.svelte.ts';
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

	type Point2 = [number, number];
	type Selection = CragSelection;
	type RoutePathDraft = RoutePathTarget;
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
	let areTrackViewportSyncHandlersReady = false;
	let suppressNextMapClick = false;
	let canAutosaveSession = $state(false);
	let autosaveSessionTimeout: ReturnType<typeof setTimeout> | undefined;
	let activeCragDraftId = $state<string | null>(null);
	const CRAG_DRAFTS_KEY = 'crag_editor_drafts_v1';
	const cragDraftSessionKey = (id: string) => `crag_editor_draft_session_${id}`;

	const trackEditor = useCragTrackEditor({
		persistence: createCragTrackPersistence(cragEditorState, {
			save: (target, segments) => routeTool.saveRouteSegments(target, segments),
			join: (base, append, coordinates, name) =>
				routeTool.joinRoutePaths({ base, candidate: append, points: coordinates, name }),
			remove: (target) =>
				routeTool.deleteRoutePath(target.documentPath, target.pathId, target.pathIndex ?? null)
		}),
		getMap: () => map,
		getActiveTool: () => activeTool,
		setActiveTool: (value) => (activeTool = value),
		setActiveTab: (value) => (activeTab = value),
		getRoutePathTarget: () => routeEditDraft,
		onShowOptions: () => {
			toolOptionsOpen = true;
		},
		onTransitionBlocked: () => {
			toolOptionsOpen = true;
		},
		onRoutePathDrawingEnd: () => (routeEditDraft = null),
		onPathFinished: () => selectObject(null),
		onPathCancelled: () => selectObject(null),
		onTrackPointDragStart: () => syncEditorData(),
		onTrackPointDragEnd: () => syncEditorData()
	});

	const routeEditController = createRouteEditController<Selection, RoutePathTarget>({
		getSelection: () => selectedObject,
		requestLeave: (next) => {
			trackEditor.requestLeave(next);
		},
		setSelection: (value) => {
			selectedObject = value;
		},
		setDraft: (value) => {
			routeEditDraft = value;
		}
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
		if (trackEditor.sessionActive && JSON.stringify(value) !== JSON.stringify(selectedObject)) {
			trackEditor.requestLeave(() => {
				void selectObject(value);
			});
			return;
		}
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

	const startRoutePathDraft = (value: RoutePathTarget | null) => {
		routeEditDraft = value;
	};
	let currentTrackPoints = $derived(trackEditor.currentTrackPoints);
	let trackDraftMode = $derived(trackEditor.trackDraftMode);
	let activeTrackTarget = $derived(trackEditor.activeTrackTarget);
	let selectedTrackPointIndexes = $derived(trackEditor.selectedTrackPointIndexes);

	const addTrackPoint = trackEditor.addTrackPoint;
	const startRoutingDraft = trackEditor.startRoutingDraft;
	const editTrack = (...args: Parameters<typeof trackEditor.editTrack>) => {
		toolOptionsOpen = true;
		return trackEditor.editTrack(...args);
	};
	const editRoutePathTrack = (...args: Parameters<typeof trackEditor.editRoutePath>) => {
		toolOptionsOpen = true;
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
		setActiveTool: (value) => (activeTool = value),
		requestTrackTransition: (action) => {
			trackEditor.requestLeave(action);
		}
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

	onMount(() => {
		canAutosaveSession = true;

		const handleKeyDown = (event: KeyboardEvent) => {
			trackEditor.handleKeyDown(event);
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			trackEditor.cleanup();
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
		if (trackEditor.handleMapClick(e)) return;
		if (suppressNextMapClick) {
			suppressNextMapClick = false;
			return;
		}

		if (activeTool === 'select') {
			selectTool.handleMapClick(e);
			return;
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
		if (activeTool === 'track' && trackDraftMode === 'routing') {
			lngLat = snapToNearestWay(map, e.point, lngLat);
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
			() => {
			},
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
		initTrackViewportSyncHandlers();
		geometryEditor.initHandlers(loadedMap);
		accessEditor.initDetectionPointHandlers();
		syncEditorData();
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
				visibleDrawingPointIndexes:
					trackEditor.operation.kind === 'join' ? [] : visibleDrawingPointIndexes(drawingPoints),
				editingDrawingPath: trackDraftMode === 'select' && trackEditor.operation.kind === 'idle',
				joinPreview: trackEditor.joinPreview,
				drawingTails: trackEditor.draftTails,
				removedDrawingPoints: trackEditor.operation.kind === 'trim' ? trackEditor.draftPoints : [],
				midpointSelected: trackEditor.midpointSelected,
				selectedTrackPointIndex: trackEditor.selectedTrackPointIndex,
				selectedTrackPointIndexes,
				activeTrackTarget
			})
		);
		syncFlightPlanPreview(map, $state.snapshot(flightPlan));
	}

	function handleFlightPlanGenerated(plan: FlightPlan | null) {
		flightPlan = plan;
		syncEditorData();
	}

	async function saveToServer() {
		if (!trackEditor.requestLeave(() => {
		})) {
			toolOptionsOpen = true;
			saveStatus = 'error';
			saveError = $_(trackEditor.message);
			return;
		}
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
	{saveStatus}
	{saveError}
/>

<RouteDetailModal
	routeEntry={trackEditor.sessionActive ? null : selectedRouteEntry}
	onClose={() => selectObject(null)}
/>
