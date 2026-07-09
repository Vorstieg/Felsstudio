import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
import { parseGpx } from '$lib/assets/js/gpx-utils.js';
import { initMapPointDragHandlers } from '$lib/components/editor/map-point-drag-handlers.js';
import { fitCoordinatesBounds } from '$lib/assets/js/track-geometry-utils.js';
import {
	appendNewTrack,
	appendTrackPointToDraft,
	buildRoutedDraft,
	removeTrackByIndex,
	updateTrackCoordinates
} from '$lib/components/editor/track/track-drawing.js';

export function useCragTrackEditor({
	getMap,
	getActiveTool,
	setActiveTool,
	setActiveTab,
	setSuppressNextMapClick
}) {
	let currentTrackPoints = $state([]);
	let routeDraftWaypoints = $state([]);
	let editingTrackIndex = $state(null);
	let trackDraftMode = $state('routing');
	let isSnappingEnabled = $state(true);
	let isRoutingTrack = $state(false);
	let draggingTrackPointIndex = null;
	let areTrackPointDragHandlersReady = false;

	async function addTrackPoint(lngLat) {
		const waypoints = $state.snapshot(routeDraftWaypoints);
		const points = $state.snapshot(currentTrackPoints);
		isRoutingTrack = trackDraftMode === 'routing' && waypoints.length > 0;
		const draft = await appendTrackPointToDraft({ trackDraftMode, waypoints, points, lngLat });
		isRoutingTrack = false;
		routeDraftWaypoints = draft.waypoints;
		currentTrackPoints = draft.points;
	}

	function handleTrackConfirm() {
		if (trackDraftMode === 'routing') confirmRoutedDraft();
		else finalizeTrack();
	}

	function confirmRoutedDraft() {
		if (currentTrackPoints.length > 1) {
			trackDraftMode = 'editing';
			routeDraftWaypoints = [];
			setActiveTab('registry');
		}
	}

	function startRoutingDraft() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		trackDraftMode = 'routing';
		setActiveTool('track');
	}

	function undoTrackPoint() {
		if (trackDraftMode === 'routing') {
			const waypoints = $state.snapshot(routeDraftWaypoints);
			if (waypoints.length === 0) return;
			rebuildRoutedDraft(waypoints.slice(0, -1));
			return;
		}
		if (currentTrackPoints.length > 0) currentTrackPoints = currentTrackPoints.slice(0, -1);
	}

	async function rebuildRoutedDraft(waypoints) {
		routeDraftWaypoints = waypoints;
		isRoutingTrack = waypoints.length >= 2;
		currentTrackPoints = await buildRoutedDraft(waypoints);
		isRoutingTrack = false;
	}

	function removeTrack(index) {
		cragEditorState.tracks = removeTrackByIndex(cragEditorState.tracks, index);
		if (editingTrackIndex === index) cancelTrackEdit();
		else if (editingTrackIndex !== null && editingTrackIndex > index) editingTrackIndex -= 1;
	}

	function finalizeTrack() {
		if (currentTrackPoints.length <= 1) return;

		const coordinates = $state.snapshot(currentTrackPoints);
		if (editingTrackIndex !== null) {
			cragEditorState.tracks = updateTrackCoordinates(
				cragEditorState.tracks,
				editingTrackIndex,
				coordinates
			);
			setActiveTab('registry');
			setActiveTool('track');
			fitTrackBounds(coordinates);
			editingTrackIndex = null;
			currentTrackPoints = [];
			routeDraftWaypoints = [];
			trackDraftMode = 'routing';
			return;
		}

		const nextTracks = appendNewTrack(cragEditorState.tracks, coordinates);
		cragEditorState.tracks = nextTracks;
		editTrack(nextTracks.length - 1, nextTracks);
	}

	function editTrack(index, tracks = cragEditorState.tracks) {
		const track = tracks[index];
		if (!track?.coordinates?.length) return;
		editingTrackIndex = index;
		currentTrackPoints = track.coordinates.map((point) => [...point]);
		routeDraftWaypoints = [];
		trackDraftMode = 'editing';
		setActiveTool('track');
		setActiveTab('registry');
		fitTrackBounds(track.coordinates);
	}

	function cancelTrackEdit() {
		currentTrackPoints = [];
		routeDraftWaypoints = [];
		editingTrackIndex = null;
		trackDraftMode = 'routing';
	}

	function fitTrackBounds(points) {
		fitCoordinatesBounds(getMap(), points);
	}

	async function handleGpxUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		const points = parseGpx(await file.text());
		if (points.length > 1) {
			const nextTracks = [
				...cragEditorState.tracks,
				{ name: file.name.replace(/\.gpx$/i, ''), coordinates: points }
			];
			cragEditorState.tracks = nextTracks;
			editTrack(nextTracks.length - 1, nextTracks);
		}
	}

	function initTrackPointDragHandlers() {
		const map = getMap();
		if (!map || areTrackPointDragHandlersReady) return;
		areTrackPointDragHandlersReady = true;

		initMapPointDragHandlers({
			map,
			layers: ['tracks-points-drawing'],
			canDrag: () => getActiveTool() === 'track' && trackDraftMode === 'editing',
			getDragState: (event) => {
				const pointIndex = Number(event.features?.[0]?.properties?.pointIndex);
				return Number.isInteger(pointIndex) ? { pointIndex } : null;
			},
			onDragStart: ({ pointIndex }) => {
				draggingTrackPointIndex = pointIndex;
			},
			onDragMove: ({ pointIndex }, event) => {
				const points = $state.snapshot(currentTrackPoints);
				if (!points[pointIndex]) return;
				points[pointIndex] = [event.lngLat.lng, event.lngLat.lat];
				currentTrackPoints = points;
			},
			onDragEnd: () => {
				draggingTrackPointIndex = null;
				setSuppressNextMapClick(true);
			}
		});
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
		addTrackPoint,
		handleTrackConfirm,
		startRoutingDraft,
		undoTrackPoint,
		removeTrack,
		finalizeTrack,
		editTrack,
		cancelTrackEdit,
		handleGpxUpload,
		initTrackPointDragHandlers
	};
}
