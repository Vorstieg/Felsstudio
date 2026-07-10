<script>
	import { onMount, untrack } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { generateRouteId } from '$lib/assets/js/id-utils.js';
	import { writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';
	import DetailsComponent from '$lib/components/editor/DetailsComponent.svelte';
	import TopoRoutesPanel from '$lib/components/editor/topo-properties/TopoRoutesPanel.svelte';
	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
	import { useTrackDrawing } from '$lib/components/editor/track/use-track-drawing.svelte.js';
	import {
		coordinatesToPathGeoJson,
		parseGpx,
		pathGeoJsonToCoordinates
	} from '$lib/assets/js/route-path-utils.js';
	import {
		fitCoordinatesBounds,
		reverseCoordinates,
		simplifyTrackCoordinates,
		trimCoordinatesEnd,
		trimCoordinatesStart
	} from '$lib/assets/js/track-geometry-utils.js';

	let saveStatus = $state('idle');
	let saveError = $state('');
	let activeTool = $state('select');
	let drawingTarget = $state(null);
	let drawMode = $state('routing');
	let map = $state();
	let isMapLoaded = $state(false);
	let mapStyle = $state('transport');
	let trimPointIndex = $state(0);
	let simplifyToleranceMeters = $state(10);
	let simplifySummary = $state('');
	let cutLineStart = $state(null);
	let cutLineEnd = $state(null);
	let pendingCut = $state(null);
	let arePointDragHandlersReady = false;
	let areViewportSyncHandlersReady = false;
	let suppressNextMapClick = false;
	let activeTrackDragState = null;
	let pendingMapSync = false;
	let pendingInitialFit = false;
	let saveTimeout = null;
	let canAutosave = false;
	let geometryRevision = $state(0);
	let drawingSnapshot = $state(null);

	const routeMainCoordinates = new WeakMap();
	const assetCoordinates = new Map();
	let pathAssetKeyCounter = 1;
	let isPersistingDraft = false;

	const trackDrawing = useTrackDrawing({
		initialMode: 'routing',
		onPointsChange: (coordinates) => {
			if (!selectedRoute) return;
			const asset =
				selectedPathAsset || createPathAsset(selectedRoute, selectedRoute.name || 'Track');
			setAssetCoordinates(asset, coordinates);
			syncRoutePathData(selectedRoute);
			if (coordinates[0]) userState.topo.coordinates = coordinates[0];
			scheduleMapSync();
		}
	});
	let isRoutingTrack = $derived(trackDrawing.isRouting);

	let selectedRoute = $derived(
		(userState.topo.routes || []).find((route) => route.id === userState.ui.selectedRouteId)
	);
	let selectedPathAsset = $derived(
		selectedRoute?.assets?.paths?.[userState.ui.selectedPathIndex ?? -1] || null
	);
	let isExpanded = $derived(viewport.isExpanded);

	onMount(() => {
		let disposed = false;
		const persistOnHide = () => {
			if (document.visibilityState === 'hidden') void persistDraftImmediately();
		};
		void (async () => {
			draftsState.init();
			if (!userState.ui.activeDraftId && isBlankPathSession(userState.topo)) {
				const latest = await draftsState.getLatest('path');
				if (latest) restoreSession(latest.session, latest.id);
			}
			userState.topo.editorMode = 'path';
			userState.ui.workspace = 'topos/path/editor';
			if (!Array.isArray(userState.topo.routes)) userState.topo.routes = [];
			await loadEmbeddedPaths();
			await persistDraftImmediately();
			if (!disposed) canAutosave = true;
		})();
		document.addEventListener('visibilitychange', persistOnHide);
		window.addEventListener('pagehide', persistOnHide);
		return () => {
			disposed = true;
			clearTimeout(saveTimeout);
			document.removeEventListener('visibilitychange', persistOnHide);
			window.removeEventListener('pagehide', persistOnHide);
		};
	});

	function addRoute(type = 'alpine-tour') {
		const route = {
			id: generateRouteId(),
			name: '',
			type,
			geometryMode: 'track',
			tags: [],
			track: { coordinates: [] },
			assets: { paths: [{ role: 'main', label: '', path: null }] },
			topo: { enabled: false, topoId: null }
		};
		userState.topo.routes = [...(userState.topo.routes || []), route];
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedPathIndex = 0;
		activeTool = 'draw';
		drawMode = 'routing';
		trackDrawing.clear(drawMode);
		scheduleMapSync();
	}

	function ensurePathRouteShape(route) {
		if (!route) return;
		if (!route.track) route.track = { coordinates: [], pointCount: 0 };
		if (!Array.isArray(route.track.coordinates)) route.track.coordinates = [];
		if (!Number.isFinite(route.track.pointCount))
			route.track.pointCount = route.track.coordinates.length;
		if (!route.geometryMode) route.geometryMode = 'track';
		if (!route.topo) route.topo = { enabled: false, topoId: null };
		if (!route.assets) route.assets = { paths: [] };
		if (!Array.isArray(route.assets.paths))
			route.assets.paths = route.assets.paths ? [route.assets.paths] : [];
		route.assets.paths = route.assets.paths.map((asset) => ({
			role: asset.role || 'main',
			label: asset.label || '',
			path: asset.path || null
		}));
	}

	function cloneCoordinates(coordinates = []) {
		return coordinates.map((point) => [...point]);
	}

	function setRouteMainCoordinates(route, coordinates = []) {
		ensurePathRouteShape(route);
		routeMainCoordinates.set(route, coordinates);
		route.track.pointCount = coordinates.length;
		// Keep large path arrays out of Svelte state. They are persisted from the
		// non-reactive geometry store on save instead.
		route.track.coordinates = [];
	}

	function getRouteMainCoordinates(route) {
		if (!route) return [];
		if (routeMainCoordinates.has(route)) return routeMainCoordinates.get(route) || [];
		return Array.isArray(route.track?.coordinates) ? cloneCoordinates(route.track.coordinates) : [];
	}

	function ensureAssetKey(asset) {
		if (!asset) return null;
		asset._pathKey = asset._pathKey || `path-${Date.now()}-${pathAssetKeyCounter++}`;
		return asset._pathKey;
	}

	function assetCoordinateKey(asset) {
		return asset?._pathKey || null;
	}

	function setAssetCoordinates(asset, coordinates = []) {
		if (!asset) return;
		assetCoordinates.set(ensureAssetKey(asset), cloneCoordinates(coordinates));
		asset._pointCount = coordinates.length;
		asset.path = coordinates.length > 1 ? coordinatesToPathGeoJson(coordinates) : null;
		delete asset._coordinates;
		geometryRevision += 1;
	}

	function createPathAsset(route, label = 'Track') {
		ensurePathRouteShape(route);
		const asset = { role: 'main', label: String(label || 'Track'), path: null };
		route.assets.paths = [...(route.assets.paths || []), asset];
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedPathIndex = route.assets.paths.length - 1;
		return asset;
	}

	function selectedPathCoordinates() {
		return getAssetCoordinates(selectedPathAsset);
	}

	function getAssetCoordinates(asset) {
		if (!asset) return [];
		const key = assetCoordinateKey(asset);
		if (key && assetCoordinates.has(key)) return assetCoordinates.get(key) || [];
		return Array.isArray(asset._coordinates) ? cloneCoordinates(asset._coordinates) : [];
	}

	function assetHasCoordinates(asset) {
		return (
			getAssetCoordinates(asset).length > 1 || pathGeoJsonToCoordinates(asset?.path).length > 1
		);
	}

	function pathSegmentsForRoute(route) {
		if (!route) return [];
		const assetSegments = [];
		for (const [segmentIndex, asset] of (route.assets?.paths || []).entries()) {
			const coordinates = getAssetCoordinates(asset);
			if (coordinates.length > 1) assetSegments.push({ segmentIndex, coordinates });
		}
		if (assetSegments.length > 0) return assetSegments;
		return [];
	}

	function firstRouteCoordinates(route) {
		if (route?.id === selectedRoute?.id && selectedPathAsset) return selectedPathCoordinates();
		return pathSegmentsForRoute(route)[0]?.coordinates || [];
	}

	function syncRoutePathData(route) {
		for (const asset of route?.assets?.paths || []) {
			const coordinates = getAssetCoordinates(asset);
			asset.path = coordinates.length > 1 ? coordinatesToPathGeoJson(coordinates) : null;
		}
	}

	function isBlankPathSession(topo) {
		return !topo?.name && !topo?._entryPath && (topo?.routes || []).length === 0;
	}

	function restoreSession(session, id) {
		userState.reset();
		userState.topo = session.topo || session;
		userState.ui.activeDraftId = id;
		userState.ui.workspace = 'topos/path/editor';
		for (const route of userState.topo.routes || []) {
			ensurePathRouteShape(route);
			for (const asset of route.assets.paths || []) {
				if (Array.isArray(asset._coordinates))
					setAssetCoordinates(asset, cloneCoordinates(asset._coordinates));
				else if (asset.path) setAssetCoordinates(asset, pathGeoJsonToCoordinates(asset.path));
			}
		}
	}

	function topoSnapshotForDraft() {
		const topo = $state.snapshot(userState.topo);
		for (const route of topo.routes || []) {
			ensurePathRouteShape(route);
			for (const [index, asset] of (route.assets.paths || []).entries()) {
				const sourceRoute = (userState.topo.routes || []).find((item) => item.id === route.id);
				const sourceAsset = sourceRoute?.assets?.paths?.[index];
				const coordinates = getAssetCoordinates(sourceAsset);
				if (coordinates.length > 0) {
					asset._coordinates = cloneCoordinates(coordinates);
					asset.path = coordinatesToPathGeoJson(coordinates);
				}
			}
		}
		return topo;
	}

	async function persistDraftImmediately() {
		if (isPersistingDraft || isBlankPathSession(userState.topo)) return;
		isPersistingDraft = true;
		try {
			const snapshot = topoSnapshotForDraft();
			snapshot.editorMode = 'path';
			userState.ui.activeDraftId = await draftsState.save(snapshot, userState.ui.activeDraftId);
			userState.ui.lastSaved = new Date().toISOString();
		} finally {
			isPersistingDraft = false;
		}
	}

	function resetCutPreview() {
		cutLineStart = null;
		cutLineEnd = null;
		pendingCut = null;
		syncCutOverlayData();
	}

	async function handleMapClick(event) {
		if (suppressNextMapClick) {
			suppressNextMapClick = false;
			return;
		}
		if (activeTool === 'cut') {
			handleCutClick([event.lngLat.lng, event.lngLat.lat]);
			return;
		}
		if (activeTool === 'select' && map) {
			const features = map.queryRenderedFeatures(event.point, {
				layers: ['path-route-points', 'path-route-lines']
			});
			const feature = features.find((item) => item.properties?.routeId);
			if (feature) {
				userState.ui.selectedRouteId = feature.properties.routeId;
				userState.ui.selectedPathIndex = Number(feature.properties.segmentIndex) || 0;
				trimPointIndex = Number(feature.properties.index) || 0;
			}
			return;
		}
		if (activeTool !== 'draw') return;
		if (!selectedRoute) return;
		ensurePathRouteShape(selectedRoute);
		trackDrawing.mode = drawMode;
		await trackDrawing.addPoint([event.lngLat.lng, event.lngLat.lat]);
	}

	function undoPoint() {
		const coordinates = firstRouteCoordinates(selectedRoute);
		if (!coordinates.length) return;
		trackDrawing.mode = drawMode;
		trackDrawing.setPoints(coordinates, drawMode === 'routing' ? 'freestyle' : drawMode);
		trackDrawing.undoPoint();
		trimPointIndex = Math.min(trimPointIndex, Math.max(0, coordinates.length - 1));
		scheduleMapSync();
	}

	function setDrawMode(mode) {
		drawMode = mode;
		trackDrawing.setPoints(
			firstRouteCoordinates(selectedRoute),
			mode === 'routing' ? 'routing' : 'freestyle'
		);
	}

	function startDrawing() {
		if (!selectedRoute) return;
		const wasNew = !selectedPathAsset;
		const asset =
			selectedPathAsset || createPathAsset(selectedRoute, selectedRoute.name || 'Track');
		drawingSnapshot = { asset, wasNew, coordinates: cloneCoordinates(getAssetCoordinates(asset)) };
		trackDrawing.setPoints(getAssetCoordinates(asset), drawMode);
		activeTool = 'draw';
	}

	function finishDrawing() {
		drawingSnapshot = null;
		activeTool = 'select';
	}

	function cancelDrawing() {
		if (!drawingSnapshot || !selectedRoute) return finishDrawing();
		if (drawingSnapshot.wasNew) {
			selectedRoute.assets.paths = selectedRoute.assets.paths.filter(
				(asset) => asset !== drawingSnapshot.asset
			);
			userState.ui.selectedPathIndex = Math.max(0, selectedRoute.assets.paths.length - 1);
		} else {
			setAssetCoordinates(drawingSnapshot.asset, drawingSnapshot.coordinates);
			syncRoutePathData(selectedRoute);
		}
		drawingSnapshot = null;
		activeTool = 'select';
		scheduleMapSync();
	}

	function clearTrack() {
		if (!selectedRoute) return;
		trackDrawing.clear(drawMode);
		if (selectedPathAsset) setAssetCoordinates(selectedPathAsset, []);
		syncRoutePathData(selectedRoute);
		trimPointIndex = 0;
		scheduleMapSync();
	}

	function normalizedTrimIndex() {
		const coordinates = firstRouteCoordinates(selectedRoute);
		const parsed = Number.parseInt(trimPointIndex, 10);
		if (!Number.isFinite(parsed)) return -1;
		return Math.max(0, Math.min(coordinates.length - 1, parsed));
	}

	function canEditSelectedTrack() {
		return firstRouteCoordinates(selectedRoute).length > 1;
	}

	function reverseSelectedTrack() {
		if (!canEditSelectedTrack()) return;
		const coordinates = reverseCoordinates(selectedPathCoordinates());
		setAssetCoordinates(selectedPathAsset, coordinates);
		syncRoutePathData(selectedRoute);
		trimPointIndex = Math.max(0, coordinates.length - 1 - normalizedTrimIndex());
		scheduleMapSync();
	}

	function trimSelectedTrackStart() {
		if (!canEditSelectedTrack()) return;
		const coordinates = selectedPathCoordinates();
		const index = normalizedTrimIndex();
		if (index <= 0 || coordinates.length - index < 2) return;
		const trimmed = trimCoordinatesStart(coordinates, index);
		setAssetCoordinates(selectedPathAsset, trimmed);
		syncRoutePathData(selectedRoute);
		trimPointIndex = 0;
		userState.topo.coordinates = trimmed[0];
		scheduleMapSync();
	}

	function trimSelectedTrackEnd() {
		if (!canEditSelectedTrack()) return;
		const coordinates = selectedPathCoordinates();
		const index = normalizedTrimIndex();
		if (index >= coordinates.length - 1 || index < 1) return;
		const trimmed = trimCoordinatesEnd(coordinates, index);
		setAssetCoordinates(selectedPathAsset, trimmed);
		syncRoutePathData(selectedRoute);
		trimPointIndex = trimmed.length - 1;
		scheduleMapSync();
	}

	function simplifySelectedTrack() {
		if (!canEditSelectedTrack() || !selectedPathAsset) return;
		const coordinates = selectedPathCoordinates();
		const tolerance = Math.max(1, Number(simplifyToleranceMeters) || 0);
		const simplified = simplifyTrackCoordinates(coordinates, tolerance);

		if (simplified.length >= coordinates.length || simplified.length < 2) {
			simplifySummary = `No further simplification at ${tolerance} m. Increase tolerance.`;
			return;
		}

		setAssetCoordinates(selectedPathAsset, simplified);
		syncRoutePathData(selectedRoute);
		trimPointIndex = Math.min(trimPointIndex, simplified.length - 1);
		simplifySummary = `${coordinates.length} → ${simplified.length} points at ${tolerance} m tolerance.`;
		scheduleMapSync();
	}

	function segmentLineIntersection(a, b, c, d) {
		const x1 = a[0];
		const y1 = a[1];
		const x2 = b[0];
		const y2 = b[1];
		const x3 = c[0];
		const y3 = c[1];
		const x4 = d[0];
		const y4 = d[1];
		const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		if (Math.abs(denominator) < 1e-12) return null;

		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
		const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
		if (t < 0 || t > 1 || u < 0 || u > 1) return null;
		return { coordinate: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)], segmentIndex: null, t };
	}

	function coordinatesEqual(a, b) {
		return Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
	}

	function findCutIntersection(coordinates, lineStart, lineEnd) {
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

	function splitCoordinatesAtIntersection(coordinates, intersection) {
		const { coordinate, segmentIndex } = intersection;
		const start = coordinates.slice(0, segmentIndex + 1);
		const end = coordinates.slice(segmentIndex + 1);
		if (!coordinatesEqual(start.at(-1), coordinate)) start.push(coordinate);
		if (!coordinatesEqual(end[0], coordinate)) end.unshift(coordinate);
		return [start, end];
	}

	function handleCutClick(coordinate) {
		if (!canEditSelectedTrack()) return;
		if (!cutLineStart || pendingCut) {
			cutLineStart = coordinate;
			cutLineEnd = null;
			pendingCut = null;
			syncCutOverlayData();
			return;
		}

		cutLineEnd = coordinate;
		rebuildPendingCut();
		syncCutOverlayData();
	}

	function confirmCut() {
		if (!selectedRoute || !pendingCut) return;
		ensurePathRouteShape(selectedRoute);
		const segmentLabel = `${selectedRoute.name || 'Track'} segment ${(selectedRoute.assets.paths || []).length + 1}`;
		const selectedIndex = userState.ui.selectedPathIndex ?? 0;
		const firstAsset = selectedPathAsset ||
			selectedRoute.assets.paths[selectedIndex] || {
				role: 'main',
				label: selectedRoute.name || 'Track',
				path: ''
			};
		const nextAsset = { role: firstAsset.role || 'main', label: segmentLabel, path: segmentLabel };
		setAssetCoordinates(firstAsset, pendingCut.startCoordinates);
		setAssetCoordinates(nextAsset, pendingCut.endCoordinates);
		selectedRoute.assets.paths = [
			...(selectedRoute.assets.paths || []).slice(0, selectedIndex),
			firstAsset,
			nextAsset,
			...(selectedRoute.assets.paths || []).slice(selectedIndex + 1)
		];
		trimPointIndex = 0;
		activeTool = 'select';
		resetCutPreview();
		scheduleMapSync(true);
	}

	function cancelCut() {
		resetCutPreview();
	}

	function rebuildPendingCut() {
		if (!selectedRoute || !cutLineStart || !cutLineEnd) {
			pendingCut = null;
			return;
		}
		const coordinates = firstRouteCoordinates(selectedRoute);
		const intersection = findCutIntersection(coordinates, cutLineStart, cutLineEnd);
		if (!intersection) {
			pendingCut = null;
			return;
		}
		const [startCoordinates, endCoordinates] = splitCoordinatesAtIntersection(
			coordinates,
			intersection
		);
		pendingCut =
			startCoordinates.length > 1 && endCoordinates.length > 1
				? { startCoordinates, endCoordinates, intersection: intersection.coordinate }
				: null;
	}

	function coordinatesForSegment(route, segmentIndex) {
		const asset = route?.assets?.paths?.[segmentIndex];
		const coordinates = getAssetCoordinates(asset);
		return coordinates.length > 0 ? coordinates : getRouteMainCoordinates(route);
	}

	function moveSelectedRoutePoint(segmentIndex, pointIndex, coordinate) {
		if (!selectedRoute) return false;
		const asset = selectedRoute.assets?.paths?.[segmentIndex];
		const assetSegment = getAssetCoordinates(asset);
		const coordinates =
			assetSegment.length > 0 ? assetSegment : getRouteMainCoordinates(selectedRoute);
		if (!coordinates[pointIndex]) return false;
		coordinates[pointIndex] = coordinate;
		if (assetSegment.length > 0) setAssetCoordinates(asset, coordinates);
		else setRouteMainCoordinates(selectedRoute, coordinates);
		syncRoutePathData(selectedRoute);
		rebuildPendingCut();
		return true;
	}

	function dragOverlayFeatures(dragState) {
		if (!selectedRoute || dragState?.type !== 'track')
			return { type: 'FeatureCollection', features: [] };
		const { segmentIndex, pointIndex } = dragState;
		const segment = coordinatesForSegment(selectedRoute, segmentIndex);
		const coordinate = dragState.coordinate || segment[pointIndex];
		if (!coordinate) return { type: 'FeatureCollection', features: [] };
		const features = [];
		if (segment[pointIndex - 1]) {
			features.push({
				type: 'Feature',
				properties: {
					id: selectedRoute.id,
					segmentIndex,
					edgeIndex: pointIndex - 1,
					selected: true,
					dragOverlay: true
				},
				geometry: { type: 'LineString', coordinates: [segment[pointIndex - 1], coordinate] }
			});
		}
		if (segment[pointIndex + 1]) {
			features.push({
				type: 'Feature',
				properties: {
					id: selectedRoute.id,
					segmentIndex,
					edgeIndex: pointIndex,
					selected: true,
					dragOverlay: true
				},
				geometry: { type: 'LineString', coordinates: [coordinate, segment[pointIndex + 1]] }
			});
		}
		features.push({
			type: 'Feature',
			properties: {
				id: selectedRoute.id,
				index: pointIndex,
				segmentIndex,
				selected: true,
				dragOverlay: true
			},
			geometry: { type: 'Point', coordinates: coordinate }
		});
		return { type: 'FeatureCollection', features };
	}

	function syncDragOverlayData() {
		const source = map?.getSource('path-route-drag-overlay');
		if (!source) return;
		source.setData(dragOverlayFeatures(activeTrackDragState));
	}

	function cutOverlayFeatures() {
		const features = [];
		if (cutLineStart && cutLineEnd) {
			features.push({
				type: 'Feature',
				properties: { id: 'cut-line-preview', cutPreview: true },
				geometry: { type: 'LineString', coordinates: [cutLineStart, cutLineEnd] }
			});
		}
		for (const [index, coordinate] of [cutLineStart, cutLineEnd].filter(Boolean).entries()) {
			features.push({
				type: 'Feature',
				properties: { id: `cut-line-point-${index}`, selected: true, cut: true },
				geometry: { type: 'Point', coordinates: coordinate }
			});
		}
		if (pendingCut?.intersection) {
			features.push({
				type: 'Feature',
				properties: { id: 'cut-intersection', selected: true, cutIntersection: true },
				geometry: { type: 'Point', coordinates: pendingCut.intersection }
			});
		}
		return { type: 'FeatureCollection', features };
	}

	function syncCutOverlayData() {
		const source = map?.getSource('path-cut-overlay');
		if (!source) return;
		source.setData(cutOverlayFeatures());
	}

	function initViewportSyncHandlers() {
		if (!map || areViewportSyncHandlersReady) return;
		areViewportSyncHandlersReady = true;
		map.on('moveend', () => scheduleMapSync());
		map.on('zoomend', () => scheduleMapSync());
		map.on('resize', () => scheduleMapSync());
	}

	function initPointDragHandlers() {
		if (!map || arePointDragHandlersReady) return;
		arePointDragHandlersReady = true;

		initMapPointDragHandlers({
			map,
			layers: ['path-route-points', 'path-cut-points'],
			canDrag: (event, layerId) => {
				const feature = event?.features?.[0];
				return layerId === 'path-route-points'
					? Boolean(feature?.properties?.selected)
					: Boolean(feature?.properties?.cut);
			},
			getDragState: (event, layerId) => {
				const feature = event.features?.[0];
				if (!feature) return null;
				if (layerId === 'path-cut-points') return { type: 'cut', pointId: feature.properties.id };
				return {
					type: 'track',
					segmentIndex: Number(feature.properties.segmentIndex) || 0,
					pointIndex: Number(feature.properties.index) || 0
				};
			},
			onDragStart: (dragState) => {
				if (dragState.type !== 'track') return;
				const segment = coordinatesForSegment(selectedRoute, dragState.segmentIndex);
				activeTrackDragState = { ...dragState, coordinate: segment[dragState.pointIndex] };
				// Hide the stale original adjacent segments while the overlay draws the
				// live point + neighboring segments.
				syncMapData(true);
				syncDragOverlayData();
			},
			onDragMove: (dragState, event) => {
				const coordinate = [event.lngLat.lng, event.lngLat.lat];
				if (dragState.type === 'cut') {
					if (dragState.pointId === 'cut-line-point-0') cutLineStart = coordinate;
					if (dragState.pointId === 'cut-line-point-1') cutLineEnd = coordinate;
					// Keep cut-point dragging cheap: update only the tiny cut overlay.
					// Intersection splitting is recalculated once on drag end.
					pendingCut = null;
					syncCutOverlayData();
				} else if (activeTrackDragState) {
					// Do not mutate the full path coordinate array while dragging. Only the
					// lightweight overlay source changes on pointer move.
					activeTrackDragState.coordinate = coordinate;
					syncDragOverlayData();
				}
			},
			onDragEnd: (dragState) => {
				if (dragState.type === 'cut') {
					rebuildPendingCut();
					syncCutOverlayData();
					suppressNextMapClick = true;
					return;
				}
				if (activeTrackDragState?.type === 'track' && activeTrackDragState.coordinate) {
					moveSelectedRoutePoint(
						activeTrackDragState.segmentIndex,
						activeTrackDragState.pointIndex,
						activeTrackDragState.coordinate
					);
					syncCutOverlayData();
				}
				activeTrackDragState = null;
				syncMapData(true);
				syncDragOverlayData();
				suppressNextMapClick = true;
			}
		});
	}

	function fitRouteBounds(coordinates) {
		fitCoordinatesBounds(map, coordinates, { maxZoom: 15 });
	}

	function focusSelectedPath(route, pathIndex) {
		const asset = route?.assets?.paths?.[pathIndex];
		const coordinates = getAssetCoordinates(asset);
		if (!map || coordinates.length < 2) return;
		const runFit = () => fitRouteBounds(coordinates);
		if (map.loaded?.()) requestAnimationFrame(runFit);
		else map.once('idle', runFit);
	}

	function preferredRouteCoordinates() {
		const selectedCoordinates = firstRouteCoordinates(selectedRoute);
		if (selectedCoordinates.length > 1) return selectedCoordinates;
		for (const route of userState.topo.routes || []) {
			const coordinates = firstRouteCoordinates(route);
			if (coordinates.length > 1) return coordinates;
		}
		return [];
	}

	function fitLoadedRoutesIfNeeded() {
		if (!pendingInitialFit || !map) return;
		const coordinates = preferredRouteCoordinates();
		if (coordinates.length < 2) return;
		pendingInitialFit = false;
		const runFit = () => fitRouteBounds(coordinates);
		if (map.loaded?.()) requestAnimationFrame(runFit);
		else map.once('idle', runFit);
	}

	async function handlePathUpload(route, event) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file || !route) return;

		try {
			const fileText = await file.text();
			const coordinates = parseGpx(fileText);
			if (coordinates.length < 2) throw new Error('GPX file does not contain a usable path.');

			userState.ui.selectedRouteId = route.id;
			ensurePathRouteShape(route);
			const label = route.name || file.name.replace(/\.[^.]+$/i, '');
			route.name = route.name || label;
			const selectedIndex =
				userState.ui.selectedRouteId === route.id ? (userState.ui.selectedPathIndex ?? -1) : -1;
			const selectedAsset = selectedIndex >= 0 ? route.assets.paths?.[selectedIndex] : null;
			let asset = selectedAsset && !assetHasCoordinates(selectedAsset) ? selectedAsset : null;
			let assetIndex = selectedIndex;
			if (!asset) {
				assetIndex = (route.assets.paths || []).findIndex((item) => !assetHasCoordinates(item));
				asset = assetIndex >= 0 ? route.assets.paths[assetIndex] : null;
			}
			if (!asset) {
				asset = createPathAsset(route, label);
				assetIndex = (route.assets.paths || []).length - 1;
			}
			asset.label = asset.label || label;
			setAssetCoordinates(asset, coordinates);
			userState.ui.selectedPathIndex =
				assetIndex >= 0 ? assetIndex : userState.ui.selectedPathIndex;
			userState.topo.coordinates = coordinates[0];
			trimPointIndex = 0;
			activeTool = 'select';
			scheduleMapSync();
			fitRouteBounds(coordinates);
		} catch (err) {
			saveStatus = 'error';
			saveError = err.message;
		}
	}

	function coordinateIsInViewport(coordinate) {
		const bounds = map?.getBounds?.();
		if (!bounds) return true;
		return bounds.contains(coordinate);
	}

	function visiblePointEntries(segment) {
		return segment
			.map((coordinate, index) => [index, coordinate])
			.filter(([, coordinate]) => coordinateIsInViewport(coordinate));
	}

	function lineFeature(route, segmentIndex, segment, selected, part = null) {
		const pathAsset = route.assets?.paths?.[segmentIndex];
		return {
			type: 'Feature',
			properties: {
				id: `${route.id}:${segmentIndex}`,
				routeId: route.id,
				name: pathAsset?.label || route.name || route.id,
				segmentIndex,
				selected,
				...(part ? { part } : {})
			},
			geometry: { type: 'LineString', coordinates: segment }
		};
	}

	function routeLineFeatures(route, segmentIndex, segment, selected) {
		if (segment.length <= 1) return [];
		if (
			activeTrackDragState?.type !== 'track' ||
			!selected ||
			activeTrackDragState.segmentIndex !== segmentIndex
		)
			return [lineFeature(route, segmentIndex, segment, selected)];

		const pointIndex = activeTrackDragState.pointIndex;
		return [
			lineFeature(route, segmentIndex, segment.slice(0, pointIndex), selected, 'before-drag'),
			lineFeature(route, segmentIndex, segment.slice(pointIndex + 1), selected, 'after-drag')
		].filter((feature) => feature.geometry.coordinates.length > 1);
	}

	function routeFeatures() {
		const features = [];
		for (const route of userState.topo.routes || []) {
			for (const { segmentIndex, coordinates: segment } of pathSegmentsForRoute(route)) {
				const selected =
					route.id === userState.ui.selectedRouteId &&
					segmentIndex === (userState.ui.selectedPathIndex ?? -1);
				features.push(...routeLineFeatures(route, segmentIndex, segment, selected));
				if (!selected) continue;
				for (const [index, coordinate] of visiblePointEntries(segment)) {
					if (
						activeTrackDragState?.type === 'track' &&
						activeTrackDragState.segmentIndex === segmentIndex &&
						activeTrackDragState.pointIndex === index
					)
						continue;
					features.push({
						type: 'Feature',
						properties: {
							id: `${route.id}:${segmentIndex}`,
							routeId: route.id,
							index,
							segmentIndex,
							selected
						},
						geometry: { type: 'Point', coordinates: coordinate }
					});
				}
			}
		}
		return { type: 'FeatureCollection', features };
	}

	function initMap(loadedMap = map) {
		map = loadedMap;
		if (!map.getSource('path-routes')) {
			map.addSource('path-routes', { type: 'geojson', data: routeFeatures() });
		}
		if (!map.getSource('path-route-drag-overlay')) {
			map.addSource('path-route-drag-overlay', {
				type: 'geojson',
				data: dragOverlayFeatures(null)
			});
		}
		if (!map.getSource('path-cut-overlay')) {
			map.addSource('path-cut-overlay', { type: 'geojson', data: cutOverlayFeatures() });
		}
		if (!map.getLayer('path-route-lines')) {
			map.addLayer({
				id: 'path-route-lines',
				type: 'line',
				source: 'path-routes',
				filter: [
					'all',
					['==', ['geometry-type'], 'LineString'],
					['!=', ['get', 'cutPreview'], true]
				],
				paint: {
					'line-color': ['case', ['==', ['get', 'selected'], true], '#2563eb', '#dc2626'],
					'line-width': ['case', ['==', ['get', 'selected'], true], 6, 3],
					'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.55]
				}
			});
		}
		if (!map.getLayer('path-cut-line')) {
			map.addLayer({
				id: 'path-cut-line',
				type: 'line',
				source: 'path-cut-overlay',
				filter: ['==', ['get', 'cutPreview'], true],
				paint: {
					'line-color': '#f59e0b',
					'line-width': 3,
					'line-dasharray': [1, 1]
				}
			});
		}
		if (!map.getLayer('path-cut-points')) {
			map.addLayer({
				id: 'path-cut-points',
				type: 'circle',
				source: 'path-cut-overlay',
				filter: ['any', ['==', ['get', 'cut'], true], ['==', ['get', 'cutIntersection'], true]],
				paint: {
					'circle-radius': ['case', ['==', ['get', 'cutIntersection'], true], 6, 7],
					'circle-color': ['case', ['==', ['get', 'cutIntersection'], true], '#16a34a', '#f59e0b'],
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 2
				}
			});
		}
		if (!map.getLayer('path-route-points')) {
			map.addLayer({
				id: 'path-route-points',
				type: 'circle',
				source: 'path-routes',
				filter: [
					'all',
					['==', ['geometry-type'], 'Point'],
					['!=', ['get', 'cut'], true],
					['!=', ['get', 'cutIntersection'], true]
				],
				paint: {
					'circle-radius': ['case', ['==', ['get', 'selected'], true], 5, 3],
					'circle-color': ['case', ['==', ['get', 'selected'], true], '#2563eb', '#dc2626'],
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 1.5
				}
			});
		}
		if (!map.getLayer('path-route-drag-lines')) {
			map.addLayer({
				id: 'path-route-drag-lines',
				type: 'line',
				source: 'path-route-drag-overlay',
				filter: ['==', ['geometry-type'], 'LineString'],
				paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 1 }
			});
		}
		if (!map.getLayer('path-route-drag-point')) {
			map.addLayer({
				id: 'path-route-drag-point',
				type: 'circle',
				source: 'path-route-drag-overlay',
				filter: ['==', ['geometry-type'], 'Point'],
				paint: {
					'circle-radius': 5,
					'circle-color': '#2563eb',
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 1.5
				}
			});
		}
		syncMapData();
		syncCutOverlayData();
		initViewportSyncHandlers();
		initPointDragHandlers();
		fitLoadedRoutesIfNeeded();
	}

	function syncMapData(force = false) {
		if (activeTrackDragState && !force) return;
		const source = map?.getSource('path-routes');
		if (!source) return;
		source.setData(routeFeatures());
	}

	function scheduleMapSync(force = false) {
		if (pendingMapSync) return;
		pendingMapSync = true;
		requestAnimationFrame(() => {
			pendingMapSync = false;
			syncMapData(force);
		});
	}

	function routeListSignature() {
		return (userState.topo.routes || [])
			.map((route) => {
				const assets = Array.isArray(route.assets?.paths)
					? route.assets.paths
					: route.assets?.paths
						? [route.assets.paths]
						: [];
				const assetSignature = assets
					.map(
						(asset) =>
							`${asset.role || ''}:${asset.label || ''}:${asset.path?.coordinates?.length || 0}:${asset._pointCount || 0}`
					)
					.join(',');
				return `${route.id}:${route.name || ''}:${route.track?.pointCount || 0}:${assetSignature}`;
			})
			.join('|');
	}

	$effect(() => {
		routeListSignature();
		userState.ui.selectedRouteId;
		userState.ui.selectedPathIndex;
		if (!isMapLoaded || !map) return;
		untrack(scheduleMapSync);
	});

	let lastFocusedSelectionKey = null;
	$effect(() => {
		const routeId = userState.ui.selectedRouteId;
		const pathIndex = userState.ui.selectedPathIndex;
		geometryRevision;
		if (!isMapLoaded || !map || !routeId) return;
		const selectionKey = `${routeId}:${pathIndex ?? ''}`;
		if (selectionKey === lastFocusedSelectionKey) return;
		const coordinates =
			selectedPathCoordinates().length > 1
				? selectedPathCoordinates()
				: firstRouteCoordinates(selectedRoute);
		if (coordinates.length < 2) return;
		lastFocusedSelectionKey = selectionKey;
		const runFit = () => fitRouteBounds(coordinates);
		if (map.loaded?.()) requestAnimationFrame(runFit);
		else map.once('idle', runFit);
	});

	$effect(() => {
		routeListSignature();
		geometryRevision;
		userState.topo.name;
		userState.topo._entryPath;
		userState.topo.coordinates;
		if (!canAutosave || isBlankPathSession(userState.topo)) return;
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			void persistDraftImmediately();
		}, 2000);
	});

	function useSearchPosition(coordinates) {
		if (!coordinates || !map) return;
		userState.topo.coordinates = coordinates;
		map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 13), duration: 500 });
	}

	function locateUser() {
		if (!navigator.geolocation || !map) return;
		navigator.geolocation.getCurrentPosition((position) => {
			const coordinates = [position.coords.longitude, position.coords.latitude];
			useSearchPosition(coordinates);
		});
	}

	function pathBasename(path = '') {
		return String(path).split('/').filter(Boolean).at(-1) || '';
	}

	async function loadEmbeddedPaths() {
		pendingInitialFit = true;
		for (const route of userState.topo.routes || []) {
			ensurePathRouteShape(route);
			for (const asset of route.assets.paths || []) {
				const coordinates = pathGeoJsonToCoordinates(asset.path);
				if (coordinates.length > 1) setAssetCoordinates(asset, coordinates);
			}
		}
		if (!userState.ui.selectedRouteId) {
			const firstRoute = (userState.topo.routes || []).find(
				(route) => (route.assets?.paths || []).length > 0
			);
			if (firstRoute) {
				userState.ui.selectedRouteId = firstRoute.id;
				userState.ui.selectedPathIndex = 0;
			}
		}
		scheduleMapSync(true);
		fitLoadedRoutesIfNeeded();
	}

	async function saveToServer() {
		if (!authState.requireAuth(() => saveToServer())) return;
		const savePath = userState.topo._entryPath;
		if (!savePath) {
			saveStatus = 'error';
			saveError = 'No save path set.';
			return;
		}
		saveStatus = 'saving';
		saveError = '';
		try {
			userState.topo.date = userState.topo.date || new Date().toISOString().split('T')[0];
			userState.topo.updated = new Date().toISOString().split('T')[0];
			const baseName = pathBasename(savePath) || 'topo';
			const fileName = userState.topo._topoFileName || `${baseName}-topo.json`;

			const data = JSON.parse(JSON.stringify(userState.topo));
			delete data._entryPath;
			delete data._topoFileName;
			data.editorMode = 'path';
			data.routes = (data.routes || []).map((route, routeIndex) => {
				const sourceRoute = (userState.topo.routes || [])[routeIndex];
				const sourceAssets = Array.isArray(sourceRoute?.assets?.paths)
					? sourceRoute.assets.paths
					: [];
				const paths = sourceAssets
					.map((asset, assetIndex) => {
						const coordinates = getAssetCoordinates(sourceAssets[assetIndex]);
						if (coordinates.length < 2) return null;
						return {
							role: asset.role || 'main',
							label: String(asset.label || sourceRoute?.name || 'Track'),
							path: coordinatesToPathGeoJson(coordinates)
						};
					})
					.filter(Boolean);
				delete route.track;
				delete route.points;
				delete route.points2D;
				route.assets = { ...(route.assets || {}), paths };
				delete route.assets.gpx;
				return route;
			});
			await writeJson(
				`${savePath}/${fileName.endsWith('.json') ? fileName : fileName + '.json'}`,
				data
			);
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
</script>

<CragEditorMap
	bind:map
	bind:isMapLoaded
	bind:mapStyle
	initialCoordinates={[16.37, 48.21]}
	onStyleLoad={initMap}
	onMapClick={handleMapClick}
/>

<ToolBar
	title={$_('ui.path_studio')}
	bind:activeTool
	tools={[
		{ id: 'select', icon: 'fa-arrow-pointer', label: 'Select', toggle: false },
		{
			id: 'draw',
			icon: 'fa-route',
			label: 'Draw Path',
			disabled: !selectedRoute,
			onSelect: startDrawing
		},
		{
			id: 'cut',
			icon: 'fa-scissors',
			label: 'Cut',
			disabled: !canEditSelectedTrack(),
			onSelect: () => {
				activeTool = 'cut';
				resetCutPreview();
			}
		}
	]}
	onBack={() => goto(base + '/')}
	undo={activeTool === 'draw'
		? { label: 'Undo point', run: undoPoint, disabled: !selectedRoute }
		: null}
	finish={activeTool === 'draw'
		? { label: $_('ui.finish'), run: finishDrawing }
		: pendingCut
			? { label: $_('ui.finish'), run: confirmCut }
			: null}
	cancel={activeTool === 'draw'
		? { label: $_('ui.cancel'), run: cancelDrawing }
		: activeTool === 'cut'
			? { label: $_('ui.cancel'), run: cancelCut }
			: null}
	save={{ status: saveStatus, errorMessage: saveError, run: saveToServer }}
>
	{#snippet controls()}
		<select bind:value={mapStyle} class="input-studio hidden w-32 xl:block">
			<option value="transport">Transport</option>
			<option value="satellite">Satellite</option>
		</select>
	{/snippet}
</ToolBar>

{#if isExpanded}
	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
		<MapSearch {map} onUsePosition={useSearchPosition} />
	</div>
{/if}

<DetailsComponent title="Routes" subtitle="Draw or attach path segments for Hochtouren and Klettersteige." width="24rem">
	{#snippet children({ mobile })}
	<div class="p-3 border-b border-black/10 space-y-2">
		<div class="grid grid-cols-2 gap-2">
			<input
				bind:value={userState.topo.name}
				class="input-studio w-full"
				placeholder="Area / tour group name"
			/>
			<input
				bind:value={userState.topo._entryPath}
				class="input-studio w-full font-mono"
				placeholder="area/name"
			/>
		</div>
		<div class="flex gap-1">
			<button
				class="px-2 py-1 rounded-sm bg-creator-blue text-white text-ui-label"
				onclick={() => addRoute('alpine-tour')}
				>+ Hochtour
			</button>
			<button
				class="px-2 py-1 rounded-sm bg-creator-blue text-white text-ui-label"
				onclick={() => addRoute('via-ferrata')}
				>+ Klettersteig
			</button>
			<button
				class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				onclick={clearTrack}
				disabled={!selectedRoute}
				>Clear track
			</button>
			<button
				class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				onclick={locateUser}
				>Locate
			</button>
		</div>
		<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-ui-label font-bold uppercase tracking-wide text-warm-gray-500">
						Drawing mode
					</div>
					<div class="text-[10px] text-warm-gray-400">
						Routing follows foot paths between clicks; freestyle connects raw clicked points.
					</div>
				</div>
				<div class="flex rounded-sm border border-black/15 overflow-hidden bg-white">
					<button
						class="px-2 py-1 text-ui-label {drawMode === 'routing'
							? 'bg-creator-blue text-white'
							: 'text-warm-gray-500'}"
						onclick={() => setDrawMode('routing')}
						disabled={!selectedRoute}
						>Routing
					</button>
					<button
						class="px-2 py-1 text-ui-label {drawMode === 'freestyle'
							? 'bg-creator-blue text-white'
							: 'text-warm-gray-500'}"
						onclick={() => setDrawMode('freestyle')}
						disabled={!selectedRoute}
						>Freestyle
					</button>
				</div>
			</div>
		</div>
		<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-ui-label font-bold uppercase tracking-wide text-warm-gray-500">
						Track tools
					</div>
					<div class="text-[10px] text-warm-gray-400">
						Click a point on the map or enter its index.
					</div>
				</div>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={reverseSelectedTrack}
					disabled={!canEditSelectedTrack()}
					>Reverse
				</button>
			</div>
			<div class="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
				<input
					bind:value={trimPointIndex}
					type="number"
					min="0"
					max={Math.max(0, firstRouteCoordinates(selectedRoute).length - 1)}
					class="input-studio w-full"
					placeholder="Point index"
					disabled={!canEditSelectedTrack()}
				/>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={trimSelectedTrackStart}
					disabled={!canEditSelectedTrack()}
					>Trim start
				</button>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={trimSelectedTrackEnd}
					disabled={!canEditSelectedTrack()}
					>Trim end
				</button>
			</div>
			<div class="grid grid-cols-[1fr_auto] gap-1 items-center">
				<input
					bind:value={simplifyToleranceMeters}
					type="number"
					min="1"
					step="1"
					class="input-studio w-full"
					placeholder="Tolerance (m)"
					disabled={!canEditSelectedTrack()}
				/>
				<button
					class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
					onclick={simplifySelectedTrack}
					disabled={!canEditSelectedTrack()}
					>Simplify path
				</button>
			</div>
			<div class="text-[10px] text-warm-gray-400">
				Removes redundant points from the selected path segment using the tolerance in meters.
			</div>
			{#if simplifySummary}
				<div class="text-[10px] text-warm-gray-500">{simplifySummary}</div>
			{/if}
		</div>
	</div>
	<div class="custom-scrollbar p-2.5">
		<TopoRoutesPanel
			routes={userState.topo.routes}
			bind:drawingTarget
			bind:activeTool
			onPathUpload={handlePathUpload}
			onPathSelect={focusSelectedPath}
		/>
	</div>
	{/snippet}
</DetailsComponent>

{#if activeTool === 'draw'}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		{isRoutingTrack
			? 'Routing path segment…'
			: drawMode === 'routing'
				? 'Routing drawing: click waypoints; paths are routed between them.'
				: 'Freestyle drawing: click points; straight path lines are appended.'}
	</div>
{/if}

{#if activeTool === 'cut'}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg"
	>
		{#if pendingCut}
			<span
				>Cut line intersects the track. Use the toolbar tick to create a new path segment, or X to
				discard it.</span
			>
		{:else}
			<span
				>{cutLineStart
					? cutLineEnd
						? 'No intersection found. Click again to start a new cut line.'
						: 'Click the second point of the cut line across the track.'
					: 'Click the first point of a cut line across the selected track.'}</span
			>
		{/if}
	</div>
{/if}
