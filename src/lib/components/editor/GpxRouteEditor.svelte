<script>
	import { onMount, untrack } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';
	import { viewport } from '$lib/state/viewport.svelte.js';
	import { generateRouteId } from '$lib/assets/js/id-utils.js';
	import { readFile, writeFile, writeJson } from '$lib/api/felslager.js';
	import { authState } from '$lib/api/auth.svelte.js';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import TopoRoutesPanel from '$lib/components/editor/topo-properties/TopoRoutesPanel.svelte';
	import CragEditorMap from '$lib/components/editor/crag/CragEditorMap.svelte';
	import MapSearch from '$lib/components/editor/MapSearch.svelte';
	import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
	import { useTrackDrawing } from '$lib/components/editor/track/use-track-drawing.svelte.js';
	import { parseGpx, gpxXmlFromCoordinates	 } from '$lib/assets/js/gpx-utils.js';
	import {
		fitCoordinatesBounds,
		reverseCoordinates,
		simplifyTrackCoordinates,
		trimCoordinatesEnd,
		trimCoordinatesStart
	} from '$lib/assets/js/track-geometry-utils.js';
	import { slugifyName } from '$lib/components/editor/crag/crag-editor-paths.js';

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

	const routeMainCoordinates = new WeakMap();
	const assetCoordinates = new Map();
	let gpxAssetKeyCounter = 1;
	let isPersistingDraft = false;

	const trackDrawing = useTrackDrawing({
		initialMode: 'routing',
		onPointsChange: (coordinates) => {
			if (!selectedRoute) return;
			const asset = selectedGpxAsset || createGpxAsset(selectedRoute, selectedRoute.name || 'Track');
			setAssetCoordinates(asset, coordinates);
			markRouteGpxStale(selectedRoute);
			if (coordinates[0]) userState.topo.coordinates = coordinates[0];
			scheduleMapSync();
		}
	});
	let isRoutingTrack = $derived(trackDrawing.isRouting);

	let selectedRoute = $derived(
		(userState.topo.routes || []).find((route) => route.id === userState.ui.selectedRouteId)
	);
	let selectedGpxAsset = $derived(selectedRoute?.assets?.gpx?.[userState.ui.selectedGpxIndex ?? -1] || null);
	let isExpanded = $derived(viewport.isExpanded);

	onMount(() => {
		let disposed = false;
		const persistOnHide = () => {
			if (document.visibilityState === 'hidden') void persistDraftImmediately();
		};
		void (async () => {
			draftsState.init();
			if (!userState.ui.activeDraftId && isBlankGpxSession(userState.topo)) {
				const latest = await draftsState.getLatest('gpx');
				if (latest) restoreSession(latest.session, latest.id);
			}
			userState.topo.editorMode = 'gpx';
			userState.ui.workspace = 'topos/gpx/editor';
			if (!Array.isArray(userState.topo.routes)) userState.topo.routes = [];
			await loadExistingGpxAssets();
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
			assets: { gpx: [{ role: 'main', label: '', path: '' }] },
			topo: { enabled: false, topoId: null }
		};
		userState.topo.routes = [...(userState.topo.routes || []), route];
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedGpxIndex = 0;
		activeTool = 'draw';
		drawMode = 'routing';
		trackDrawing.clear(drawMode);
		scheduleMapSync();
	}

	function ensureGpxRouteShape(route) {
		if (!route) return;
		if (!route.track) route.track = { coordinates: [], pointCount: 0 };
		if (!Array.isArray(route.track.coordinates)) route.track.coordinates = [];
		if (!Number.isFinite(route.track.pointCount)) route.track.pointCount = route.track.coordinates.length;
		if (!route.geometryMode) route.geometryMode = 'track';
		if (!route.topo) route.topo = { enabled: false, topoId: null };
		if (!route.assets) route.assets = { gpx: [] };
		if (!Array.isArray(route.assets.gpx)) route.assets.gpx = route.assets.gpx ? [route.assets.gpx] : [];
		if (route.assets.gpx.some((asset) => typeof asset === 'string')) {
			route.assets.gpx = route.assets.gpx.map((asset) =>
				typeof asset === 'string'
					? { role: 'main', label: pathBasename(asset).replace(/\.gpx$/i, ''), path: asset }
					: asset
			);
		}
	}

	function cloneCoordinates(coordinates = []) {
		return coordinates.map((point) => [...point]);
	}

	function setRouteMainCoordinates(route, coordinates = []) {
		ensureGpxRouteShape(route);
		routeMainCoordinates.set(route, coordinates);
		route.track.pointCount = coordinates.length;
		// Keep large GPX arrays out of Svelte state. They are persisted from the
		// non-reactive geometry store on save instead.
		route.track.coordinates = [];
	}

	function getRouteMainCoordinates(route) {
		if (!route) return [];
		if (routeMainCoordinates.has(route)) return routeMainCoordinates.get(route) || [];
		ensureGpxRouteShape(route);
		const coordinates = Array.isArray(route.track.coordinates) ? cloneCoordinates(route.track.coordinates) : [];
		setRouteMainCoordinates(route, coordinates);
		return coordinates;
	}

	function ensureAssetKey(asset) {
		if (!asset) return null;
		asset._gpxKey = asset._gpxKey || `gpx-${Date.now()}-${gpxAssetKeyCounter++}`;
		return asset._gpxKey;
	}

	function assetCoordinateKey(asset) {
		return asset?._gpxKey || null;
	}

	function setAssetCoordinates(asset, coordinates = []) {
		if (!asset) return;
		assetCoordinates.set(ensureAssetKey(asset), coordinates);
		asset._pointCount = coordinates.length;
		delete asset._coordinates;
		geometryRevision += 1;
	}

	function createGpxAsset(route, label = 'Track', content = null) {
		ensureGpxRouteShape(route);
		const slugifiedLabel = slugifyName(label);
		const asset = { role: 'main', label: slugifiedLabel, path: slugifiedLabel };
		if (content) asset._content = content;
		route.assets.gpx = [...(route.assets.gpx || []), asset];
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedGpxIndex = route.assets.gpx.length - 1;
		return asset;
	}

	function selectedGpxCoordinates() {
		return getAssetCoordinates(selectedGpxAsset);
	}

	function getAssetCoordinates(asset) {
		if (!asset) return [];
		const key = assetCoordinateKey(asset);
		if (key && assetCoordinates.has(key)) return assetCoordinates.get(key) || [];
		return Array.isArray(asset._coordinates) ? cloneCoordinates(asset._coordinates) : [];
	}

	function gpxSegmentsForRoute(route) {
		if (!route) return [];
		ensureGpxRouteShape(route);
		const assetSegments = [];
		for (const [segmentIndex, asset] of (route.assets?.gpx || []).entries()) {
			const coordinates = getAssetCoordinates(asset);
			if (coordinates.length > 1) assetSegments.push({ segmentIndex, coordinates });
		}
		if (assetSegments.length > 0) return assetSegments;
		return [];
	}

	function firstRouteCoordinates(route) {
		if (route?.id === selectedRoute?.id && selectedGpxAsset) return selectedGpxCoordinates();
		return gpxSegmentsForRoute(route)[0]?.coordinates || [];
	}

	function markRouteGpxStale(route) {
		for (const asset of route?.assets?.gpx || []) delete asset._content;
	}

	function isBlankGpxSession(topo) {
		return !topo?.name && !topo?._entryPath && (topo?.routes || []).length === 0;
	}

	function restoreSession(session, id) {
		userState.reset();
		const topo = session.topo || session;
		userState.topo = topo;
		userState.ui.activeDraftId = id;
		userState.ui.workspace = 'topos/gpx/editor';
		for (const route of userState.topo.routes || []) {
			ensureGpxRouteShape(route);
			for (const asset of route.assets.gpx || []) {
				if (Array.isArray(asset._coordinates)) setAssetCoordinates(asset, cloneCoordinates(asset._coordinates));
			}
		}
	}

	function topoSnapshotForDraft() {
		const topo = $state.snapshot(userState.topo);
		for (const route of topo.routes || []) {
			ensureGpxRouteShape(route);
			for (const asset of route.assets.gpx || []) {
				const sourceRoute = (userState.topo.routes || []).find((item) => item.id === route.id);
				const index = route.assets.gpx.indexOf(asset);
				const sourceAsset = sourceRoute?.assets?.gpx?.[index];
				const coordinates = getAssetCoordinates(sourceAsset);
				if (coordinates.length > 0) asset._coordinates = cloneCoordinates(coordinates);
			}
		}
		return topo;
	}

	async function persistDraftImmediately() {
		if (isPersistingDraft || isBlankGpxSession(userState.topo)) return;
		isPersistingDraft = true;
		try {
			const snapshot = topoSnapshotForDraft();
			snapshot.editorMode = 'gpx';
			const id = await draftsState.save(snapshot, userState.ui.activeDraftId);
			userState.ui.activeDraftId = id;
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
			const features = map.queryRenderedFeatures(event.point, { layers: ['gpx-route-points', 'gpx-route-lines'] });
			const feature = features.find((item) => item.properties?.routeId);
			if (feature) {
				userState.ui.selectedRouteId = feature.properties.routeId;
				userState.ui.selectedGpxIndex = Number(feature.properties.segmentIndex) || 0;
				trimPointIndex = Number(feature.properties.index) || 0;
			}
			return;
		}
		if (activeTool !== 'draw') return;
		if (!selectedRoute) return;
		ensureGpxRouteShape(selectedRoute);
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
		trackDrawing.setPoints(firstRouteCoordinates(selectedRoute), mode === 'routing' ? 'routing' : 'freestyle');
	}

	function startDrawing() {
		if (!selectedRoute) return;
		const asset = selectedGpxAsset || createGpxAsset(selectedRoute, selectedRoute.name || 'Track');
		trackDrawing.setPoints(getAssetCoordinates(asset), drawMode);
		activeTool = 'draw';
	}

	function clearTrack() {
		if (!selectedRoute) return;
		trackDrawing.clear(drawMode);
		if (selectedGpxAsset) setAssetCoordinates(selectedGpxAsset, []);
		markRouteGpxStale(selectedRoute);
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
		const coordinates = reverseCoordinates(selectedGpxCoordinates());
		setAssetCoordinates(selectedGpxAsset, coordinates);
		markRouteGpxStale(selectedRoute);
		trimPointIndex = Math.max(0, coordinates.length - 1 - normalizedTrimIndex());
		scheduleMapSync();
	}

	function trimSelectedTrackStart() {
		if (!canEditSelectedTrack()) return;
		const coordinates = selectedGpxCoordinates();
		const index = normalizedTrimIndex();
		if (index <= 0 || coordinates.length - index < 2) return;
		const trimmed = trimCoordinatesStart(coordinates, index);
		setAssetCoordinates(selectedGpxAsset, trimmed);
		markRouteGpxStale(selectedRoute);
		trimPointIndex = 0;
		userState.topo.coordinates = trimmed[0];
		scheduleMapSync();
	}

	function trimSelectedTrackEnd() {
		if (!canEditSelectedTrack()) return;
		const coordinates = selectedGpxCoordinates();
		const index = normalizedTrimIndex();
		if (index >= coordinates.length - 1 || index < 1) return;
		const trimmed = trimCoordinatesEnd(coordinates, index);
		setAssetCoordinates(selectedGpxAsset, trimmed);
		markRouteGpxStale(selectedRoute);
		trimPointIndex = trimmed.length - 1;
		scheduleMapSync();
	}

	function simplifySelectedTrack() {
		if (!canEditSelectedTrack() || !selectedGpxAsset) return;
		const coordinates = selectedGpxCoordinates();
		const tolerance = Math.max(1, Number(simplifyToleranceMeters) || 0);
		const simplified = simplifyTrackCoordinates(coordinates, tolerance);

		if (simplified.length >= coordinates.length || simplified.length < 2) {
			simplifySummary = `No further simplification at ${tolerance} m. Increase tolerance.`;
			return;
		}

		setAssetCoordinates(selectedGpxAsset, simplified);
		markRouteGpxStale(selectedRoute);
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
			const intersection = segmentLineIntersection(coordinates[index], coordinates[index + 1], lineStart, lineEnd);
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
		ensureGpxRouteShape(selectedRoute);
		const segmentLabel = `${selectedRoute.name || 'Track'} segment ${(selectedRoute.assets.gpx || []).length + 1}`;
		const selectedIndex = userState.ui.selectedGpxIndex ?? 0;
		const firstAsset = selectedGpxAsset || selectedRoute.assets.gpx[selectedIndex] || {
			role: 'main',
			label: selectedRoute.name || 'Track',
			path: ''
		};
		const nextAsset = { role: firstAsset.role || 'main', label: segmentLabel, path: segmentLabel };
		setAssetCoordinates(firstAsset, pendingCut.startCoordinates);
		setAssetCoordinates(nextAsset, pendingCut.endCoordinates);
		delete firstAsset._content;
		selectedRoute.assets.gpx = [
			...(selectedRoute.assets.gpx || []).slice(0, selectedIndex),
			firstAsset,
			nextAsset,
			...(selectedRoute.assets.gpx || []).slice(selectedIndex + 1)
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
		const [startCoordinates, endCoordinates] = splitCoordinatesAtIntersection(coordinates, intersection);
		pendingCut = startCoordinates.length > 1 && endCoordinates.length > 1
			? { startCoordinates, endCoordinates, intersection: intersection.coordinate }
			: null;
	}

	function coordinatesForSegment(route, segmentIndex) {
		const asset = route?.assets?.gpx?.[segmentIndex];
		const coordinates = getAssetCoordinates(asset);
		return coordinates.length > 0 ? coordinates : getRouteMainCoordinates(route);
	}

	function moveSelectedRoutePoint(segmentIndex, pointIndex, coordinate) {
		if (!selectedRoute) return false;
		const asset = selectedRoute.assets?.gpx?.[segmentIndex];
		const assetSegment = getAssetCoordinates(asset);
		const coordinates = assetSegment.length > 0 ? assetSegment : getRouteMainCoordinates(selectedRoute);
		if (!coordinates[pointIndex]) return false;
		coordinates[pointIndex] = coordinate;
		if (assetSegment.length > 0) setAssetCoordinates(asset, coordinates);
		else setRouteMainCoordinates(selectedRoute, coordinates);
		markRouteGpxStale(selectedRoute);
		rebuildPendingCut();
		return true;
	}

	function dragOverlayFeatures(dragState) {
		if (!selectedRoute || dragState?.type !== 'track') return { type: 'FeatureCollection', features: [] };
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
				properties: { id: selectedRoute.id, segmentIndex, edgeIndex: pointIndex, selected: true, dragOverlay: true },
				geometry: { type: 'LineString', coordinates: [coordinate, segment[pointIndex + 1]] }
			});
		}
		features.push({
			type: 'Feature',
			properties: { id: selectedRoute.id, index: pointIndex, segmentIndex, selected: true, dragOverlay: true },
			geometry: { type: 'Point', coordinates: coordinate }
		});
		return { type: 'FeatureCollection', features };
	}

	function syncDragOverlayData() {
		const source = map?.getSource('gpx-route-drag-overlay');
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
		const source = map?.getSource('gpx-cut-overlay');
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
			layers: ['gpx-route-points', 'gpx-cut-points'],
			canDrag: (event, layerId) => {
				const feature = event?.features?.[0];
				return layerId === 'gpx-route-points'
					? Boolean(feature?.properties?.selected)
					: Boolean(feature?.properties?.cut);
			},
			getDragState: (event, layerId) => {
				const feature = event.features?.[0];
				if (!feature) return null;
				if (layerId === 'gpx-cut-points') return { type: 'cut', pointId: feature.properties.id };
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
					// Do not mutate the full GPX coordinate array while dragging. Only the
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

	async function handleGpxUpload(route, event) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file || !route) return;

		try {
			const fileText = await file.text();
			const coordinates = parseGpx(fileText);
			if (coordinates.length < 2) throw new Error('GPX file does not contain a usable track.');

			userState.ui.selectedRouteId = route.id;
			ensureGpxRouteShape(route);
			const label = route.name || file.name.replace(/\.gpx$/i, '');
			route.name = route.name || label;
			const asset = createGpxAsset(route, label, fileText);
			setAssetCoordinates(asset, coordinates);
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
		const gpx = route.assets?.gpx?.[segmentIndex];
		return {
			type: 'Feature',
			properties: {
				id: `${route.id}:${segmentIndex}`,
				routeId: route.id,
				name: gpx?.label || route.name || route.id,
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
		) return [lineFeature(route, segmentIndex, segment, selected)];

		const pointIndex = activeTrackDragState.pointIndex;
		return [
			lineFeature(route, segmentIndex, segment.slice(0, pointIndex), selected, 'before-drag'),
			lineFeature(route, segmentIndex, segment.slice(pointIndex + 1), selected, 'after-drag')
		].filter((feature) => feature.geometry.coordinates.length > 1);
	}

	function routeFeatures() {
		const features = [];
		for (const route of userState.topo.routes || []) {
			for (const { segmentIndex, coordinates: segment } of gpxSegmentsForRoute(route)) {
				const selected = route.id === userState.ui.selectedRouteId && segmentIndex === (userState.ui.selectedGpxIndex ?? -1);
				features.push(...routeLineFeatures(route, segmentIndex, segment, selected));
				if (!selected) continue;
				for (const [index, coordinate] of visiblePointEntries(segment)) {
					if (
						activeTrackDragState?.type === 'track' &&
						activeTrackDragState.segmentIndex === segmentIndex &&
						activeTrackDragState.pointIndex === index
					) continue;
					features.push({
						type: 'Feature',
						properties: { id: `${route.id}:${segmentIndex}`, routeId: route.id, index, segmentIndex, selected },
						geometry: { type: 'Point', coordinates: coordinate }
					});
				}
			}
		}
		return { type: 'FeatureCollection', features };
	}

	function initMap(loadedMap = map) {
		map = loadedMap;
		if (!map.getSource('gpx-routes')) {
			map.addSource('gpx-routes', { type: 'geojson', data: routeFeatures() });
		}
		if (!map.getSource('gpx-route-drag-overlay')) {
			map.addSource('gpx-route-drag-overlay', { type: 'geojson', data: dragOverlayFeatures(null) });
		}
		if (!map.getSource('gpx-cut-overlay')) {
			map.addSource('gpx-cut-overlay', { type: 'geojson', data: cutOverlayFeatures() });
		}
		if (!map.getLayer('gpx-route-lines')) {
			map.addLayer({
				id: 'gpx-route-lines',
				type: 'line',
				source: 'gpx-routes',
				filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'cutPreview'], true]],
				paint: {
					'line-color': ['case', ['==', ['get', 'selected'], true], '#2563eb', '#dc2626'],
					'line-width': ['case', ['==', ['get', 'selected'], true], 6, 3],
					'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.55]
				}
			});
		}
		if (!map.getLayer('gpx-cut-line')) {
			map.addLayer({
				id: 'gpx-cut-line',
				type: 'line',
				source: 'gpx-cut-overlay',
				filter: ['==', ['get', 'cutPreview'], true],
				paint: {
					'line-color': '#f59e0b',
					'line-width': 3,
					'line-dasharray': [1, 1]
				}
			});
		}
		if (!map.getLayer('gpx-cut-points')) {
			map.addLayer({
				id: 'gpx-cut-points',
				type: 'circle',
				source: 'gpx-cut-overlay',
				filter: ['any', ['==', ['get', 'cut'], true], ['==', ['get', 'cutIntersection'], true]],
				paint: {
					'circle-radius': ['case', ['==', ['get', 'cutIntersection'], true], 6, 7],
					'circle-color': ['case', ['==', ['get', 'cutIntersection'], true], '#16a34a', '#f59e0b'],
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 2
				}
			});
		}
		if (!map.getLayer('gpx-route-points')) {
			map.addLayer({
				id: 'gpx-route-points',
				type: 'circle',
				source: 'gpx-routes',
				filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'cut'], true], ['!=', ['get', 'cutIntersection'], true]],
				paint: {
					'circle-radius': ['case', ['==', ['get', 'selected'], true], 5, 3],
					'circle-color': ['case', ['==', ['get', 'selected'], true], '#2563eb', '#dc2626'],
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 1.5
				}
			});
		}
		if (!map.getLayer('gpx-route-drag-lines')) {
			map.addLayer({
				id: 'gpx-route-drag-lines',
				type: 'line',
				source: 'gpx-route-drag-overlay',
				filter: ['==', ['geometry-type'], 'LineString'],
				paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 1 }
			});
		}
		if (!map.getLayer('gpx-route-drag-point')) {
			map.addLayer({
				id: 'gpx-route-drag-point',
				type: 'circle',
				source: 'gpx-route-drag-overlay',
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
		const source = map?.getSource('gpx-routes');
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
				const assets = Array.isArray(route.assets?.gpx) ? route.assets.gpx : route.assets?.gpx ? [route.assets.gpx] : [];
				const assetSignature = assets
					.map((asset) =>
						typeof asset === 'string'
							? asset
							: `${asset.role || ''}:${asset.label || ''}:${asset.path || ''}:${asset._pointCount || 0}`
					)
					.join(',');
				return `${route.id}:${route.name || ''}:${route.track?.pointCount || 0}:${assetSignature}`;
			})
			.join('|');
	}

	$effect(() => {
		routeListSignature();
		userState.ui.selectedRouteId;
		userState.ui.selectedGpxIndex;
		if (!isMapLoaded || !map) return;
		untrack(scheduleMapSync);
	});

	let lastFocusedSelectionKey = null;
	$effect(() => {
		const routeId = userState.ui.selectedRouteId;
		const gpxIndex = userState.ui.selectedGpxIndex;
		geometryRevision;
		if (!isMapLoaded || !map || !routeId) return;
		const selectionKey = `${routeId}:${gpxIndex ?? ''}`;
		if (selectionKey === lastFocusedSelectionKey) return;
		const coordinates = selectedGpxCoordinates().length > 1 ? selectedGpxCoordinates() : firstRouteCoordinates(selectedRoute);
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
		if (!canAutosave || isBlankGpxSession(userState.topo)) return;
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

	async function loadExistingGpxAssets() {
		const basePath = userState.topo._entryPath;
		pendingInitialFit = true;
		if (!basePath) {
			fitLoadedRoutesIfNeeded();
			return;
		}
		for (const route of userState.topo.routes || []) {
			ensureGpxRouteShape(route);
			for (const asset of route.assets.gpx || []) {
				if (!asset.path || getAssetCoordinates(asset).length > 0) continue;
				try {
					const text = await (await readFile(`${basePath}/${asset.path}`)).text();
					const coordinates = parseGpx(text);
					if (coordinates.length > 1) setAssetCoordinates(asset, coordinates);
				} catch {
					// Missing GPX files are non-fatal; keep the route JSON editable.
				}
			}
		}
		if (!userState.ui.selectedRouteId) {
			const firstRoute = (userState.topo.routes || []).find((route) => (route.assets?.gpx || []).length > 0);
			if (firstRoute) {
				userState.ui.selectedRouteId = firstRoute.id;
				userState.ui.selectedGpxIndex = 0;
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
			const baseName = pathBasename(savePath) || slugifyName(userState.topo.name, 'routes');
			const fileName = userState.topo._topoFileName || `${baseName}-routes.json`;

			for (const route of userState.topo.routes || []) {
				ensureGpxRouteShape(route);

				for (const asset of route.assets.gpx || []) {
					const coordinates = getAssetCoordinates(asset);
					if (coordinates.length < 2) continue;
					const label = asset.label || route.name || 'Track';
					const slugifiedLabel = slugifyName(label);
					asset.label = slugifiedLabel;
					asset.path = slugifiedLabel;
					const content = asset._content || gpxXmlFromCoordinates(slugifiedLabel, coordinates);
					await writeFile(`${savePath}/${asset.path}`, content, 'application/gpx+xml');
				}
			}

			const data = JSON.parse(JSON.stringify(userState.topo));
			delete data._entryPath;
			delete data._topoFileName;
			data.editorMode = 'gpx';
			data.routes = (data.routes || []).map((route) => {
				delete route.track;
				delete route.points;
				delete route.points2D;
				if (route.assets?.gpx) {
					route.assets.gpx = route.assets.gpx.map((asset) => {
						delete asset._content;
						delete asset._coordinates;
						delete asset._pointCount;
						delete asset._gpxKey;
						return asset;
					});
				}
				return route;
			});
			await writeJson(`${savePath}/${fileName.endsWith('.json') ? fileName : fileName + '.json'}`, data);
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

<div class="fixed top-2 left-2 right-2 z-50 panel p-1.5 flex items-center justify-between shadow-panel bg-white">
	<div class="flex items-center gap-2.5">
		<button
			class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5"
			onclick={() => goto(base + '/')} title={$_('ui.back_to_launcher')}>
			<i class="fa-solid fa-arrow-left text-[11px]"></i>
		</button>
		<div class="ml-1 mr-3 hidden sm:block"><h1 class="text-section-title leading-none">{$_('ui.gpx_studio')}</h1></div>
		<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>
		<button
			class="px-3 py-1.5 rounded-sm text-ui-label {activeTool === 'select' ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTool = 'select')}>
			<i class="fa-solid fa-arrow-pointer mr-1"></i>Select
		</button>
		<button
			class="px-3 py-1.5 rounded-sm text-ui-label {activeTool === 'draw' ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={startDrawing} disabled={!selectedRoute}>
			<i class="fa-solid fa-route mr-1"></i>Draw GPX
		</button>
		<button
			class="px-3 py-1.5 rounded-sm text-ui-label {activeTool === 'cut' ? 'bg-creator-blue text-white' : 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => { activeTool = 'cut'; resetCutPreview(); }} disabled={!canEditSelectedTrack()}>
			<i class="fa-solid fa-scissors mr-1"></i>Cut
		</button>
		<button class="px-3 py-1.5 rounded-sm text-ui-label text-warm-gray-500 hover:bg-black/5" onclick={undoPoint}
		        disabled={!selectedRoute}>
			Undo point
		</button>
		<select bind:value={mapStyle} class="input-studio w-32 hidden md:block">
			<option value="transport">Transport</option>
			<option value="satellite">Satellite</option>
		</select>
	</div>
	<div class="flex items-center gap-4 pr-1">
		<SaveStatus status={saveStatus} errorMessage={saveError} />
		<button
			class="bg-creator-blue text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-creator-blue-active transition-none uppercase tracking-widest"
			onclick={saveToServer} disabled={saveStatus === 'saving'}>
			{$_('save.save_to_server')}
		</button>
	</div>
</div>

{#if isExpanded}
	<div class="fixed top-14 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] md:right-auto">
		<MapSearch {map} onUsePosition={useSearchPosition} />
	</div>
{/if}

<div
	class="fixed top-14 right-2 z-50 w-96 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-4rem)] overflow-hidden panel flex flex-col shadow-panel">
	<div class="border-b border-black/15 p-3 pb-2 flex-shrink-0">
		<h2 class="text-section-title">Routes</h2>
		<p class="text-ui-label !m-0">Draw or attach GPX tracks for Hochtouren and Klettersteige.</p>
	</div>
	<div class="p-3 border-b border-black/10 space-y-2">
		<div class="grid grid-cols-2 gap-2">
			<input bind:value={userState.topo.name} class="input-studio w-full" placeholder="Area / tour group name" />
			<input bind:value={userState.topo._entryPath} class="input-studio w-full font-mono"
			       placeholder="entries/area/name" />
		</div>
		<div class="flex gap-1">
			<button class="px-2 py-1 rounded-sm bg-creator-blue text-white text-ui-label"
			        onclick={() => addRoute('alpine-tour')}>+ Hochtour
			</button>
			<button class="px-2 py-1 rounded-sm bg-creator-blue text-white text-ui-label"
			        onclick={() => addRoute('via-ferrata')}>+ Klettersteig
			</button>
			<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
			        onclick={clearTrack} disabled={!selectedRoute}>Clear track
			</button>
			<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
			        onclick={locateUser}>Locate
			</button>
		</div>
		<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-ui-label font-bold uppercase tracking-wide text-warm-gray-500">Drawing mode</div>
					<div class="text-[10px] text-warm-gray-400">Routing follows foot paths between clicks; freestyle connects raw
						clicked points.
					</div>
				</div>
				<div class="flex rounded-sm border border-black/15 overflow-hidden bg-white">
					<button
						class="px-2 py-1 text-ui-label {drawMode === 'routing' ? 'bg-creator-blue text-white' : 'text-warm-gray-500'}"
						onclick={() => setDrawMode('routing')} disabled={!selectedRoute}>Routing
					</button>
					<button
						class="px-2 py-1 text-ui-label {drawMode === 'freestyle' ? 'bg-creator-blue text-white' : 'text-warm-gray-500'}"
						onclick={() => setDrawMode('freestyle')} disabled={!selectedRoute}>Freestyle
					</button>
				</div>
			</div>
		</div>
		<div class="rounded-sm border border-black/10 bg-black/[0.02] p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-ui-label font-bold uppercase tracking-wide text-warm-gray-500">Track tools</div>
					<div class="text-[10px] text-warm-gray-400">Click a point on the map or enter its index.</div>
				</div>
				<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				        onclick={reverseSelectedTrack} disabled={!canEditSelectedTrack()}>Reverse
				</button>
			</div>
			<div class="grid grid-cols-[1fr_auto_auto] gap-1 items-center">
				<input bind:value={trimPointIndex} type="number" min="0"
				       max={Math.max(0, firstRouteCoordinates(selectedRoute).length - 1)} class="input-studio w-full"
				       placeholder="Point index" disabled={!canEditSelectedTrack()} />
				<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				        onclick={trimSelectedTrackStart} disabled={!canEditSelectedTrack()}>Trim start
				</button>
				<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				        onclick={trimSelectedTrackEnd} disabled={!canEditSelectedTrack()}>Trim end
				</button>
			</div>
			<div class="grid grid-cols-[1fr_auto] gap-1 items-center">
				<input bind:value={simplifyToleranceMeters} type="number" min="1" step="1" class="input-studio w-full"
				       placeholder="Tolerance (m)" disabled={!canEditSelectedTrack()} />
				<button class="px-2 py-1 rounded-sm border border-black/15 bg-white text-ui-label text-warm-gray-500"
				        onclick={simplifySelectedTrack} disabled={!canEditSelectedTrack()}>Simplify GPX
				</button>
			</div>
			<div class="text-[10px] text-warm-gray-400">Removes redundant points from the selected GPX segment using the
				tolerance in meters.
			</div>
			{#if simplifySummary}
				<div class="text-[10px] text-warm-gray-500">{simplifySummary}</div>
			{/if}
		</div>
	</div>
	<div class="overflow-y-auto custom-scrollbar p-2.5 flex-1">
		<TopoRoutesPanel
			routes={userState.topo.routes}
			bind:drawingTarget
			bind:activeTool
			onGpxUpload={handleGpxUpload}
		/>
	</div>
</div>

{#if activeTool === 'draw'}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg">
		{isRoutingTrack ? 'Routing GPX segment…' : drawMode === 'routing' ? 'Routing drawing: click waypoints; paths are routed between them.' : 'Freestyle drawing: click points; straight GPX lines are appended.'}
	</div>
{/if}

{#if activeTool === 'cut'}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-sm border border-black/10 bg-near-black px-3 py-2 text-sm text-white shadow-lg">
		{#if pendingCut}
			<div class="flex items-center gap-3">
				<span>Cut line intersects the track. Confirm to create a new GPX segment in this route.</span>
				<button class="rounded-sm bg-creator-blue px-2 py-1 text-ui-label text-white" onclick={confirmCut}>Confirm cut
				</button>
				<button class="rounded-sm border border-white/30 px-2 py-1 text-ui-label text-white" onclick={cancelCut}>
					Cancel
				</button>
			</div>
		{:else}
			<div class="flex items-center gap-3">
				<span>{cutLineStart ? cutLineEnd ? 'No intersection found. Click again to start a new cut line.' : 'Click the second point of the cut line across the track.' : 'Click the first point of a cut line across the selected track.'}</span>
				{#if cutLineStart}
					<button class="rounded-sm border border-white/30 px-2 py-1 text-ui-label text-white" onclick={cancelCut}>
						Cancel
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
