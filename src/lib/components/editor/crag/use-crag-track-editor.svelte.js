import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
import { parseGpx } from '$lib/assets/js/route-path-utils.js';
import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
import {
	fitCoordinatesBounds,
	reverseCoordinates,
	simplifyTrackCoordinates,
	trimCoordinatesEnd,
	trimCoordinatesStart
} from '$lib/assets/js/track-geometry-utils.js';
import {
	appendTrackPointToDraft,
	buildRoutedDraft
} from '$lib/components/editor/track/track-drawing.js';
import { createAccessFeature, createAccessId } from '$lib/assets/js/access-geojson.js';

export function useCragTrackEditor({
	getMap,
	getActiveTool,
	setActiveTool,
	setActiveTab,
	setSuppressNextMapClick,
	getRoutePathTarget = () => null,
	onSaveRoutePath = () => {},
	onRoutePathDrawingEnd = () => {},
	onPathFinished = () => {},
	onPathCancelled = () => {},
	onTrackPointDragStart = () => {},
	onTrackPointDragEnd = () => {}
}) {
	let currentTrackPoints = $state([]);
	let routeDraftWaypoints = $state([]);
	let editingTrackIndex = $state(null);
	let trackDraftMode = $state('routing');
	let isSnappingEnabled = $state(true);
	let isRoutingTrack = $state(false);
	let draggingTrackPoint = $state(null);
	let selectedTrackPointIndex = $state(null);
	let areTrackPointDragHandlersReady = false;
	let trackEditHistory = [];
	const approachFeatures = () =>
		cragEditorState.access.features.filter((feature) => feature.properties?.kind === 'approach');
	const replaceApproaches = (features) => {
		cragEditorState.access = {
			...cragEditorState.access,
			features: [
				...cragEditorState.access.features.filter(
					(feature) => feature.properties?.kind !== 'approach'
				),
				...features
			]
		};
	};

	function createDraftSnapshot() {
		return {
			points: $state.snapshot(currentTrackPoints).map((point) => [...point]),
			waypoints: $state.snapshot(routeDraftWaypoints).map((point) => [...point]),
			mode: trackDraftMode
		};
	}

	function saveDraftHistory() {
		trackEditHistory.push(createDraftSnapshot());
	}

	function saveDraftSnapshot(snapshot) {
		trackEditHistory.push(snapshot);
	}

	function saveTrackPointMoveHistory(pointIndex, coordinate) {
		trackEditHistory.push({ type: 'point-move', pointIndex, coordinate: [...coordinate] });
	}

	function restoreDraftSnapshot(snapshot) {
		currentTrackPoints = snapshot.points;
		routeDraftWaypoints = snapshot.waypoints;
		trackDraftMode = snapshot.mode;
	}

	function clearDraftHistory() {
		trackEditHistory = [];
	}

	async function addTrackPoint(lngLat) {
		const waypoints = $state.snapshot(routeDraftWaypoints);
		const points = $state.snapshot(currentTrackPoints);
		const snapshot = createDraftSnapshot();
		isRoutingTrack = trackDraftMode === 'routing' && waypoints.length > 0;
		const draft = await appendTrackPointToDraft({ trackDraftMode, waypoints, points, lngLat });
		isRoutingTrack = false;
		saveDraftSnapshot(snapshot);
		routeDraftWaypoints = draft.waypoints;
		currentTrackPoints = draft.points;
	}

	function handleTrackConfirm() {
		finalizeTrack();
	}

	function startRoutingDraft() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		clearDraftHistory();
		selectedTrackPointIndex = null;
		setActiveTool('track');
	}

	function setTrackDraftMode(mode) {
		if (mode !== 'routing' && mode !== 'editing') return;
		if (trackDraftMode === mode) return;

		trackDraftMode = mode;
		routeDraftWaypoints =
			mode === 'routing' && currentTrackPoints.length > 0
				? [currentTrackPoints[currentTrackPoints.length - 1]]
				: [];
	}

	function undoTrackPoint() {
		const snapshot = trackEditHistory.pop();
		if (snapshot) {
			if (snapshot.type === 'point-move') {
				const points = $state.snapshot(currentTrackPoints);
				if (points[snapshot.pointIndex]) {
					points[snapshot.pointIndex] = snapshot.coordinate;
					currentTrackPoints = points;
				}
				return;
			}
			restoreDraftSnapshot(snapshot);
			return;
		}

		if (trackDraftMode === 'routing') {
			const waypoints = $state.snapshot(routeDraftWaypoints);
			if (waypoints.length === 0) return;
			rebuildRoutedDraft(waypoints.slice(0, -1));
			return;
		}
		if (currentTrackPoints.length > 0) currentTrackPoints = currentTrackPoints.slice(0, -1);
	}

	function insertTrackPoint(index, coordinate) {
		if (!Array.isArray(coordinate) || currentTrackPoints.length < 2) return false;
		saveDraftHistory();
		const points = $state.snapshot(currentTrackPoints);
		points.splice(index, 0, [...coordinate]);
		currentTrackPoints = points;
		selectedTrackPointIndex = index;
		return true;
	}

	function removeTrackPoint(index) {
		if (currentTrackPoints.length <= 2 || !currentTrackPoints[index]) return false;
		saveDraftHistory();
		currentTrackPoints = $state
			.snapshot(currentTrackPoints)
			.filter((_, pointIndex) => pointIndex !== index);
		selectedTrackPointIndex = null;
		return true;
	}

	function useEditedTrackPoints(points) {
		saveDraftHistory();
		currentTrackPoints = points;
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
	}

	function reverseTrack() {
		if (currentTrackPoints.length <= 1) return false;
		useEditedTrackPoints(reverseCoordinates($state.snapshot(currentTrackPoints)));
		return true;
	}

	function trimTrackStart(index) {
		const points = $state.snapshot(currentTrackPoints);
		const trimIndex = Math.max(0, Math.min(points.length - 1, Number(index)));
		if (!Number.isInteger(trimIndex) || trimIndex <= 0 || points.length - trimIndex < 2)
			return false;
		useEditedTrackPoints(trimCoordinatesStart(points, trimIndex));
		return true;
	}

	function trimTrackEnd(index) {
		const points = $state.snapshot(currentTrackPoints);
		const trimIndex = Math.max(0, Math.min(points.length - 1, Number(index)));
		if (!Number.isInteger(trimIndex) || trimIndex < 1 || trimIndex >= points.length - 1)
			return false;
		useEditedTrackPoints(trimCoordinatesEnd(points, trimIndex));
		return true;
	}

	function simplifyTrack(toleranceMeters) {
		const points = $state.snapshot(currentTrackPoints);
		if (points.length <= 1) return { changed: false, pointCount: points.length };

		const tolerance = Math.max(1, Number(toleranceMeters) || 0);
		const simplified = simplifyTrackCoordinates(points, tolerance);
		if (simplified.length >= points.length || simplified.length < 2) {
			return { changed: false, pointCount: points.length, tolerance };
		}

		useEditedTrackPoints(simplified);
		return {
			changed: true,
			pointCount: simplified.length,
			previousPointCount: points.length,
			tolerance
		};
	}

	async function rebuildRoutedDraft(waypoints) {
		routeDraftWaypoints = waypoints;
		isRoutingTrack = waypoints.length >= 2;
		currentTrackPoints = await buildRoutedDraft(waypoints);
		isRoutingTrack = false;
	}

	function removeTrack(id) {
		const next = approachFeatures().filter((feature) => feature.id !== id);
		replaceApproaches(next);
		if (editingTrackIndex === id) cancelTrackEdit();
	}

	function splitEditingTrack(startCoordinates, endCoordinates) {
		if (editingTrackIndex === null || startCoordinates.length < 2 || endCoordinates.length < 2)
			return false;

		const track = approachFeatures().find((feature) => feature.id === editingTrackIndex);
		if (!track) return false;

		const segmentName = `${track.properties?.name || 'Approach Track'} segment 2`;
		replaceApproaches([
			...approachFeatures().flatMap((feature) =>
				feature.id === editingTrackIndex
					? [
							{ ...feature, geometry: { type: 'LineString', coordinates: startCoordinates } },
							{
								...feature,
								id: createAccessId('approach'),
								properties: { ...feature.properties, name: segmentName },
								geometry: { type: 'LineString', coordinates: endCoordinates }
							}
						]
					: [feature]
			)
		]);
		resetDraft();
		setActiveTab('registry');
		setActiveTool('position');
		return true;
	}

	function finalizeTrack() {
		if (currentTrackPoints.length <= 1) return;

		const coordinates = $state.snapshot(currentTrackPoints);
		const routePathTarget = getRoutePathTarget();
		if (routePathTarget) {
			onSaveRoutePath(routePathTarget, coordinates);
			setActiveTab('sectors');
			setActiveTool('position');
			resetDraft();
			onRoutePathDrawingEnd();
			onPathFinished();
			return;
		}

		if (editingTrackIndex !== null) {
			replaceApproaches(
				approachFeatures().map((feature) =>
					feature.id === editingTrackIndex
						? { ...feature, geometry: { type: 'LineString', coordinates } }
						: feature
				)
			);
			setActiveTab('registry');
			setActiveTool('track');
			fitTrackBounds(coordinates);
			editingTrackIndex = null;
			currentTrackPoints = [];
			routeDraftWaypoints = [];
			clearDraftHistory();
			onPathFinished();
			return;
		}

		replaceApproaches([
			...approachFeatures(),
			createAccessFeature({
				id: createAccessId('approach'),
				kind: 'approach',
				geometry: { type: 'LineString', coordinates },
				properties: { name: `Approach ${approachFeatures().length + 1}` }
			})
		]);
		resetDraft();
	}

	function editTrack(id) {
		const track = approachFeatures().find((feature) => feature.id === id);
		if (!track?.geometry?.coordinates?.length) return;
		editingTrackIndex = id;
		currentTrackPoints = track.geometry.coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
		clearDraftHistory();
		selectedTrackPointIndex = null;
		setActiveTool('track');
		setActiveTab('registry');
		fitTrackBounds(track.geometry.coordinates);
	}

	function editRoutePath(coordinates) {
		if (coordinates.length < 2) return;
		editingTrackIndex = null;
		currentTrackPoints = coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
		clearDraftHistory();
		selectedTrackPointIndex = null;
		setActiveTool('track');
		setActiveTab('sectors');
		fitTrackBounds(coordinates);
	}

	function cancelTrackEdit() {
		const routePathTarget = getRoutePathTarget();
		resetDraft();
		if (routePathTarget) onRoutePathDrawingEnd();
		onPathCancelled();
	}

	function resetDraft() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		clearDraftHistory();
		selectedTrackPointIndex = null;
	}

	function fitTrackBounds(points) {
		fitCoordinatesBounds(getMap(), points);
	}

	async function handleGpxUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		const points = parseGpx(await file.text());
		if (points.length > 1) {
			const routePathTarget = getRoutePathTarget();
			if (routePathTarget) {
				onSaveRoutePath(routePathTarget, points);
				setActiveTab('sectors');
				setActiveTool('position');
				resetDraft();
				onRoutePathDrawingEnd();
				onPathFinished();
				return;
			}
			const feature = createAccessFeature({
				id: createAccessId('approach'),
				kind: 'approach',
				geometry: { type: 'LineString', coordinates: points },
				properties: { name: file.name.replace(/\.gpx$/i, '') }
			});
			replaceApproaches([...approachFeatures(), feature]);
			editTrack(feature.id);
		}
	}

	function initTrackPointDragHandlers() {
		const map = getMap();
		if (!map || areTrackPointDragHandlersReady) return;
		areTrackPointDragHandlersReady = true;

		initMapPointDragHandlers({
			map,
			layers: ['tracks-points-drawing', 'tracks-point-midpoints'],
			canDrag: () => getActiveTool() === 'track' && trackDraftMode === 'editing',
			getDragState: (event, layerId) => {
				const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
				return Number.isInteger(pointIndex)
					? { pointIndex, isMidpoint: layerId === 'tracks-point-midpoints' }
					: null;
			},
			onDragStart: (drag, event) => {
				if (drag.isMidpoint) {
					if (
						!event.lngLat ||
						!insertTrackPoint(drag.pointIndex, [event.lngLat.lng, event.lngLat.lat])
					)
						return false;
				} else {
					saveTrackPointMoveHistory(drag.pointIndex, currentTrackPoints[drag.pointIndex]);
				}
				const pointIndex = drag.pointIndex;
				const coordinate = $state.snapshot(currentTrackPoints)[pointIndex];
				if (!coordinate) return;
				draggingTrackPoint = { pointIndex, coordinate: [...coordinate] };
				selectedTrackPointIndex = pointIndex;
				onTrackPointDragStart();
			},
			onDragMove: ({ pointIndex }, event) => {
				if (draggingTrackPoint?.pointIndex !== pointIndex) return;
				draggingTrackPoint.coordinate = [event.lngLat.lng, event.lngLat.lat];
			},
			onDragEnd: ({ pointIndex }) => {
				if (draggingTrackPoint?.pointIndex === pointIndex) {
					const points = $state.snapshot(currentTrackPoints);
					points[pointIndex] = draggingTrackPoint.coordinate;
					currentTrackPoints = points;
				}
				draggingTrackPoint = null;
				onTrackPointDragEnd();
				setSuppressNextMapClick(true);
			}
		});

		const deleteTrackPoint = (event) => {
			if (getActiveTool() !== 'track') return;
			const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex) || !removeTrackPoint(pointIndex)) return;
			event.originalEvent?.stopPropagation?.();
			setSuppressNextMapClick(true);
			onTrackPointDragEnd();
		};
		map.on('click', 'tracks-point-delete', deleteTrackPoint);
		map.on('touchstart', 'tracks-point-delete', deleteTrackPoint);
	}

	return {
		get currentTrackPoints() {
			return currentTrackPoints;
		},
		get editingTrackIndex() {
			return editingTrackIndex;
		},
		get trackDraftMode() {
			return trackDraftMode;
		},
		get isSnappingEnabled() {
			return isSnappingEnabled;
		},
		get isRoutingTrack() {
			return isRoutingTrack;
		},
		get draggingTrackPoint() {
			return draggingTrackPoint;
		},
		get selectedTrackPointIndex() {
			return selectedTrackPointIndex;
		},
		addTrackPoint,
		handleTrackConfirm,
		startRoutingDraft,
		setTrackDraftMode,
		undoTrackPoint,
		insertTrackPoint,
		removeTrackPoint,
		reverseTrack,
		trimTrackStart,
		trimTrackEnd,
		simplifyTrack,
		removeTrack,
		splitEditingTrack,
		finalizeTrack,
		editTrack,
		editRoutePath,
		cancelTrackEdit,
		handleGpxUpload,
		initTrackPointDragHandlers
	};
}
