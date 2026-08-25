import { parseGpx } from '$lib/assets/js/route-path-utils.js';
import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
import {
	cleanStationaryTrackCoordinates,
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
	state,
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
	onTrackPointDragEnd = () => {},
	getTrackFeature = (target) => {
		if (target?.kind !== 'access') return null;
		return state.access.features.find((feature) => feature.id === target.featureId) || null;
	},
	saveTrackGeometry = (target, coordinates) => {
		if (target?.kind !== 'access') return false;
		state.replaceAccessFeatures(
			state.access.features.map((feature) =>
				feature.id === target.featureId
					? { ...feature, geometry: { type: 'LineString', coordinates } }
					: feature
			)
		);
		return true;
	},
	removeTrackTarget = (target) => {
		if (target?.kind !== 'access') return false;
		state.replaceAccessFeatures(
			state.access.features.filter((feature) => feature.id !== target.featureId)
		);
		return true;
	}
}) {
	let currentTrackPoints = $state([]);
	let routeDraftWaypoints = $state([]);
	let activeTrackTarget = $state(null);
	let trackDraftMode = $state('routing');
	let isSnappingEnabled = $state(true);
	let isRoutingTrack = $state(false);
	let draggingTrackPoint = $state(null);
	let selectedTrackPointIndex = $state(null);
	let selectedTrackPointIndexes = $state(new Set());
	let trackSelectionAnchor = $state(null);
	let touchLongPress = null;
	let isTouchRangePending = false;
	let skipLongPressClick = false;
	let areTrackPointDragHandlersReady = false;
	let trackEditHistory = [];
	const approachFeatures = () =>
		state.access.features.filter((feature) => feature.properties?.kind === 'approach');
	const replaceApproaches = (features) => {
		state.replaceAccessFeatures([
			...state.access.features.filter((feature) => feature.properties?.kind !== 'approach'),
			...features
		]);
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

	function clearTrackSelection() {
		selectedTrackPointIndexes = new Set();
		trackSelectionAnchor = null;
		isTouchRangePending = false;
		skipLongPressClick = false;
		clearTimeout(touchLongPress?.timer);
		touchLongPress = null;
	}

	function toggleTrackPointSelection(index, { range = false } = {}) {
		if (!Number.isInteger(index) || !currentTrackPoints[index]) return false;
		const selected = new Set(selectedTrackPointIndexes);
		if (
			range &&
			Number.isInteger(trackSelectionAnchor) &&
			currentTrackPoints[trackSelectionAnchor]
		) {
			const [start, end] = [trackSelectionAnchor, index].sort((a, b) => a - b);
			for (let pointIndex = start; pointIndex <= end; pointIndex += 1) selected.add(pointIndex);
		} else if (selected.has(index)) {
			selected.delete(index);
		} else {
			selected.add(index);
		}
		selectedTrackPointIndexes = selected;
		trackSelectionAnchor = index;
		return true;
	}

	function selectTrackPointScreenRegion(start, end, map) {
		if (!start || !end || !map?.project) return false;
		const left = Math.min(start.x, end.x);
		const right = Math.max(start.x, end.x);
		const top = Math.min(start.y, end.y);
		const bottom = Math.max(start.y, end.y);
		const selected = new Set(selectedTrackPointIndexes);
		let changed = false;
		for (const [index, coordinate] of currentTrackPoints.entries()) {
			const point = map.project(coordinate);
			if (point.x < left || point.x > right || point.y < top || point.y > bottom) continue;
			selected.add(index);
			changed = true;
		}
		if (!changed) return false;
		selectedTrackPointIndexes = selected;
		return true;
	}

	function simplifySelectedTrackCoordinates(points, selectedIndexes, tolerance) {
		const simplified = [];
		let index = 0;
		while (index < points.length) {
			if (!selectedIndexes.has(index)) {
				simplified.push(points[index]);
				index += 1;
				continue;
			}
			const start = index;
			while (index + 1 < points.length && selectedIndexes.has(index + 1)) index += 1;
			const end = index;
			const first = Math.max(0, start - 1);
			const last = Math.min(points.length - 1, end + 1);
			const segment = simplifyTrackCoordinates(points.slice(first, last + 1), tolerance);
			if (first < start) segment[0] = points[first];
			if (last > end) segment[segment.length - 1] = points[last];
			simplified.push(...segment.slice(simplified.length ? 1 : 0));
			index = last + 1;
		}
		return simplified;
	}

	function deleteSelectedTrackPoints() {
		const selected = selectedTrackPointIndexes;
		if (selected.size === 0 || currentTrackPoints.length - selected.size < 2) return false;
		saveDraftHistory();
		currentTrackPoints = $state
			.snapshot(currentTrackPoints)
			.filter((_, index) => !selected.has(index));
		clearTrackSelection();
		return true;
	}

	function restoreDraftSnapshot(snapshot) {
		currentTrackPoints = snapshot.points;
		routeDraftWaypoints = snapshot.waypoints;
		trackDraftMode = snapshot.mode;
		clearTrackSelection();
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
		activeTrackTarget = getRoutePathTarget()
			? { kind: 'route-path', ...getRoutePathTarget() }
			: null;
		clearDraftHistory();
		selectedTrackPointIndex = null;
		clearTrackSelection();
		setActiveTool('track');
	}

	function setTrackDraftMode(mode) {
		if (!['routing', 'editing', 'select', 'delete'].includes(mode)) return;
		if (trackDraftMode === mode) return;

		trackDraftMode = mode;
		routeDraftWaypoints =
			mode === 'routing' && currentTrackPoints.length > 0
				? [currentTrackPoints[currentTrackPoints.length - 1]]
				: [];
		clearTrackSelection();
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
		clearTrackSelection();
		return true;
	}

	function removeTrackPoint(index) {
		if (currentTrackPoints.length <= 2 || !currentTrackPoints[index]) return false;
		saveDraftHistory();
		currentTrackPoints = $state
			.snapshot(currentTrackPoints)
			.filter((_, pointIndex) => pointIndex !== index);
		selectedTrackPointIndex = null;
		clearTrackSelection();
		return true;
	}

	function useEditedTrackPoints(points) {
		saveDraftHistory();
		currentTrackPoints = points;
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
		clearTrackSelection();
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
		const selected = selectedTrackPointIndexes;
		const simplified = selected.size
			? simplifySelectedTrackCoordinates(points, selected, tolerance)
			: simplifyTrackCoordinates(points, tolerance);
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

	function cleanTrackPauses(radiusMeters, minimumPoints) {
		const points = $state.snapshot(currentTrackPoints);
		if (points.length <= 2) return { changed: false, pointCount: points.length };

		const radius = Math.max(1, Number(radiusMeters) || 0);
		const minimum = Math.max(3, Math.round(Number(minimumPoints) || 0));
		const cleaned = cleanStationaryTrackCoordinates(points, {
			radiusMeters: radius,
			minimumPoints: minimum
		});
		if (cleaned.length >= points.length || cleaned.length < 2) {
			return { changed: false, pointCount: points.length, radius, minimum };
		}

		useEditedTrackPoints(cleaned);
		return {
			changed: true,
			pointCount: cleaned.length,
			previousPointCount: points.length,
			radius,
			minimum
		};
	}

	async function rebuildRoutedDraft(waypoints) {
		routeDraftWaypoints = waypoints;
		isRoutingTrack = waypoints.length >= 2;
		currentTrackPoints = await buildRoutedDraft(waypoints);
		isRoutingTrack = false;
	}

	function removeTrack(id) {
		removeTrackTarget({ kind: 'access', featureId: id });
		if (activeTrackTarget?.kind === 'access' && activeTrackTarget.featureId === id)
			cancelTrackEdit();
	}

	function splitEditingTrack(startCoordinates, endCoordinates) {
		if (
			activeTrackTarget?.kind !== 'access' ||
			startCoordinates.length < 2 ||
			endCoordinates.length < 2
		)
			return false;

		const track = getTrackFeature(activeTrackTarget);
		if (!track) return false;

		const segmentName = `${track.properties?.name || 'Approach Track'} segment 2`;
		replaceApproaches([
			...approachFeatures().flatMap((feature) =>
				feature.id === activeTrackTarget.featureId
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
			setActiveTool('position');
			resetDraft();
			onRoutePathDrawingEnd();
			onPathFinished();
			return;
		}

		if (activeTrackTarget?.kind === 'access') {
			saveTrackGeometry(activeTrackTarget, coordinates);
			setActiveTab('registry');
			setActiveTool('track');
			fitTrackBounds(coordinates);
			activeTrackTarget = null;
			currentTrackPoints = [];
			routeDraftWaypoints = [];
			clearDraftHistory();
			clearTrackSelection();
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
		const target = { kind: 'access', featureId: id };
		const track = getTrackFeature(target);
		if (!track?.geometry?.coordinates?.length) return;
		activeTrackTarget = target;
		currentTrackPoints = track.geometry.coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'select';
		clearDraftHistory();
		selectedTrackPointIndex = null;
		clearTrackSelection();
		setActiveTool('track');
		setActiveTab('registry');
		fitTrackBounds(track.geometry.coordinates);
	}

	function editRoutePath(coordinates) {
		if (!Array.isArray(coordinates)) return;
		activeTrackTarget = getRoutePathTarget()
			? { kind: 'route-path', ...getRoutePathTarget() }
			: null;
		currentTrackPoints = coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'select';
		clearDraftHistory();
		selectedTrackPointIndex = null;
		clearTrackSelection();
		setActiveTool('track');
		if (coordinates.length > 1) fitTrackBounds(coordinates);
	}

	function cancelTrackEdit() {
		const routePathTarget = getRoutePathTarget();
		resetDraft();
		if (routePathTarget) onRoutePathDrawingEnd();
		onPathCancelled();
	}

	function commitRoutePathEdit() {
		const routePathTarget = getRoutePathTarget();
		if (!routePathTarget) return false;
		if (currentTrackPoints.length > 1) {
			onSaveRoutePath(routePathTarget, $state.snapshot(currentTrackPoints));
		}
		setActiveTool('position');
		resetDraft();
		onRoutePathDrawingEnd();
		return true;
	}

	function resetDraft() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		activeTrackTarget = null;
		clearDraftHistory();
		selectedTrackPointIndex = null;
		clearTrackSelection();
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
		let selectionBoxStart = null;
		let selectionBox = null;

		initMapPointDragHandlers({
			map,
			layers: ['tracks-points-drawing', 'tracks-point-midpoints'],
			canDrag: (event, layerId) => {
				if (getActiveTool() !== 'track') return false;
				if (trackDraftMode === 'editing') return true;
				if (trackDraftMode !== 'select' || layerId !== 'tracks-points-drawing') return false;
				const pointIndex = Number(event?.features?.[0]?.properties?.pointIndex);
				return selectedTrackPointIndexes.has(pointIndex);
			},
			getDragState: (event, layerId) => {
				const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
				return Number.isInteger(pointIndex)
					? { pointIndex, isMidpoint: layerId === 'tracks-point-midpoints' }
					: null;
			},
			onDragStart: (drag, event) => {
				if (trackDraftMode === 'select') {
					const points = $state.snapshot(currentTrackPoints);
					drag.selectedIndexes = [...selectedTrackPointIndexes];
					drag.startCoordinate = [...points[drag.pointIndex]];
					drag.startPoints = points.map((point) => [...point]);
					draggingTrackPoint = {
						pointIndex: drag.pointIndex,
						coordinate: [...drag.startCoordinate],
						selectedIndexes: drag.selectedIndexes
					};
					saveDraftHistory();
					onTrackPointDragStart();
					return;
				}
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
			onDragMove: (drag, event) => {
				const { pointIndex } = drag;
				if (draggingTrackPoint?.pointIndex !== pointIndex) return;
				if (trackDraftMode === 'select') {
					const coordinate = [event.lngLat.lng, event.lngLat.lat];
					const offset = [
						coordinate[0] - drag.startCoordinate[0],
						coordinate[1] - drag.startCoordinate[1]
					];
					const points = drag.startPoints.map((point, index) =>
						drag.selectedIndexes.includes(index)
							? [point[0] + offset[0], point[1] + offset[1]]
							: point
					);
					currentTrackPoints = points;
					draggingTrackPoint = { ...draggingTrackPoint, coordinate };
					return;
				}
				draggingTrackPoint.coordinate = [event.lngLat.lng, event.lngLat.lat];
			},
			onDragEnd: (drag) => {
				const { pointIndex } = drag;
				if (draggingTrackPoint?.pointIndex === pointIndex) {
					if (trackDraftMode === 'editing') {
						const points = $state.snapshot(currentTrackPoints);
						points[pointIndex] = draggingTrackPoint.coordinate;
						currentTrackPoints = points;
					}
				}
				draggingTrackPoint = null;
				onTrackPointDragEnd();
				setSuppressNextMapClick(true);
			}
		});

		const deleteTrackPoint = (event) => {
			if (getActiveTool() !== 'track' || trackDraftMode !== 'editing') return;
			const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex) || !removeTrackPoint(pointIndex)) return;
			event.originalEvent?.stopPropagation?.();
			setSuppressNextMapClick(true);
			onTrackPointDragEnd();
		};
		map.on('click', 'tracks-point-delete', deleteTrackPoint);
		map.on('touchstart', 'tracks-point-delete', deleteTrackPoint);

		const selectTrackPoint = (event) => {
			if (getActiveTool() !== 'track' || trackDraftMode !== 'select') return;
			if (skipLongPressClick) {
				skipLongPressClick = false;
				event.originalEvent?.stopPropagation?.();
				setSuppressNextMapClick(true);
				return;
			}
			const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
			const range = Boolean(event.originalEvent?.shiftKey) || isTouchRangePending;
			if (!toggleTrackPointSelection(pointIndex, { range })) return;
			isTouchRangePending = false;
			event.originalEvent?.stopPropagation?.();
			setSuppressNextMapClick(true);
		};
		const beginTouchRange = (event) => {
			if (getActiveTool() !== 'track' || trackDraftMode !== 'select') return;
			const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex)) return;
			clearTimeout(touchLongPress?.timer);
			touchLongPress = {
				pointIndex,
				triggered: false,
				timer: setTimeout(() => {
					trackSelectionAnchor = pointIndex;
					isTouchRangePending = true;
					touchLongPress = { pointIndex, triggered: true, timer: null };
				}, 500)
			};
		};
		const endTouchRange = () => {
			if (touchLongPress?.triggered) skipLongPressClick = true;
			clearTimeout(touchLongPress?.timer);
			touchLongPress = null;
		};
		map.on('click', 'tracks-points-drawing', selectTrackPoint);
		map.on('touchstart', 'tracks-points-drawing', beginTouchRange);
		map.on('touchend', 'tracks-points-drawing', endTouchRange);

		const deleteTrackPointInDeleteMode = (event) => {
			if (getActiveTool() !== 'track' || trackDraftMode !== 'delete') return;
			const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex) || !removeTrackPoint(pointIndex)) return;
			event.originalEvent?.stopPropagation?.();
			setSuppressNextMapClick(true);
			onTrackPointDragEnd();
		};
		map.on('click', 'tracks-points-drawing', deleteTrackPointInDeleteMode);
		map.on('touchstart', 'tracks-points-drawing', deleteTrackPointInDeleteMode);

		const removeSelectionBox = () => {
			selectionBox?.remove();
			selectionBox = null;
		};
		const updateSelectionBox = (end) => {
			if (!selectionBoxStart || !selectionBox) return;
			const left = Math.min(selectionBoxStart.x, end.x);
			const top = Math.min(selectionBoxStart.y, end.y);
			selectionBox.style.left = `${left}px`;
			selectionBox.style.top = `${top}px`;
			selectionBox.style.width = `${Math.abs(end.x - selectionBoxStart.x)}px`;
			selectionBox.style.height = `${Math.abs(end.y - selectionBoxStart.y)}px`;
		};
		map.on('mousedown', (event) => {
			if (
				getActiveTool() !== 'track' ||
				trackDraftMode !== 'select' ||
				event.originalEvent?.button !== 0 ||
				event.originalEvent?.shiftKey ||
				event.originalEvent?.altKey ||
				event.originalEvent?.ctrlKey ||
				event.originalEvent?.metaKey ||
				map.queryRenderedFeatures(event.point, { layers: ['tracks-points-drawing'] }).length
			)
				return;
			selectionBoxStart = event.point;
			selectionBox = document.createElement('div');
			selectionBox.style.cssText =
				'position:absolute;pointer-events:none;border:1px dashed #2563eb;background:rgba(59,130,246,.14);z-index:2;';
			map.getContainer().append(selectionBox);
			map.dragPan.disable();
		});
		map.on('mousemove', (event) => updateSelectionBox(event.point));
		map.on('mouseup', (event) => {
			if (!selectionBoxStart) return;
			const start = selectionBoxStart;
			selectionBoxStart = null;
			removeSelectionBox();
			map.dragPan.enable();
			if (Math.hypot(event.point.x - start.x, event.point.y - start.y) < 4) return;
			selectTrackPointScreenRegion(start, event.point, map);
			setSuppressNextMapClick(true);
		});
	}

	return {
		get currentTrackPoints() {
			return currentTrackPoints;
		},
		get activeTrackTarget() {
			return activeTrackTarget;
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
		get selectedTrackPointIndexes() {
			return [...selectedTrackPointIndexes];
		},
		get selectedTrackPointCount() {
			return selectedTrackPointIndexes.size;
		},
		addTrackPoint,
		handleTrackConfirm,
		startRoutingDraft,
		setTrackDraftMode,
		undoTrackPoint,
		insertTrackPoint,
		removeTrackPoint,
		clearTrackSelection,
		toggleTrackPointSelection,
		selectTrackPointScreenRegion,
		deleteSelectedTrackPoints,
		reverseTrack,
		trimTrackStart,
		trimTrackEnd,
		simplifyTrack,
		cleanTrackPauses,
		removeTrack,
		splitEditingTrack,
		finalizeTrack,
		editTrack,
		editRoutePath,
		cancelTrackEdit,
		commitRoutePathEdit,
		handleGpxUpload,
		initTrackPointDragHandlers
	};
}
