import maplibregl from 'maplibre-gl';
import { cragEditorState } from '$lib/state/crag-editor.svelte.js';
import {
	appendNewTrack,
	appendTrackPointToDraft,
	buildRoutedDraft,
	removeTrackByIndex,
	updateTrackCoordinates
} from '$lib/components/editor/crag/crag-editor-tracks.js';

export function useCragTrackEditor({ getMap, getActiveTool, setActiveTool, setActiveTab, setSuppressNextMapClick }) {
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
			cragEditorState.tracks = updateTrackCoordinates(cragEditorState.tracks, editingTrackIndex, coordinates);
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
		const map = getMap();
		if (!map || points.length === 0) return;
		const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
		map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
	}

	async function handleGpxUpload(event) {
		const file = event.target.files[0];
		if (!file) return;
		const text = await file.text();
		const parser = new DOMParser();
		const xml = parser.parseFromString(text, 'text/xml');
		const points = Array.from(xml.querySelectorAll('trkpt'))
			.map((p) => [parseFloat(p.getAttribute('lon')), parseFloat(p.getAttribute('lat'))])
			.filter((p) => !isNaN(p[0]) && !isNaN(p[1]));
		if (points.length > 1) {
			const nextTracks = [...cragEditorState.tracks, { name: file.name.replace('.gpx', ''), coordinates: points }];
			cragEditorState.tracks = nextTracks;
			editTrack(nextTracks.length - 1, nextTracks);
		}
	}

	function initTrackPointDragHandlers() {
		const map = getMap();
		if (!map || areTrackPointDragHandlersReady) return;
		areTrackPointDragHandlersReady = true;

		map.on('mouseenter', 'tracks-points-drawing', () => {
			if (getActiveTool() === 'track' && trackDraftMode === 'editing') map.getCanvas().style.cursor = 'move';
		});
		map.on('mouseleave', 'tracks-points-drawing', () => {
			if (draggingTrackPointIndex === null) map.getCanvas().style.cursor = '';
		});
		map.on('mousedown', 'tracks-points-drawing', (e) => {
			if (getActiveTool() !== 'track' || trackDraftMode !== 'editing') return;
			const pointIndex = Number(e.features?.[0]?.properties?.pointIndex);
			if (!Number.isInteger(pointIndex)) return;
			e.preventDefault();
			draggingTrackPointIndex = pointIndex;
			map.dragPan.disable();
			map.getCanvas().style.cursor = 'move';
		});
		map.on('mousemove', (e) => {
			if (draggingTrackPointIndex === null) return;
			const points = $state.snapshot(currentTrackPoints);
			if (!points[draggingTrackPointIndex]) return;
			points[draggingTrackPointIndex] = [e.lngLat.lng, e.lngLat.lat];
			currentTrackPoints = points;
		});
		map.on('mouseup', () => {
			if (draggingTrackPointIndex === null) return;
			draggingTrackPointIndex = null;
			setSuppressNextMapClick(true);
			map.dragPan.enable();
			map.getCanvas().style.cursor = '';
		});
	}

	return {
		get currentTrackPoints() { return currentTrackPoints; },
		get editingTrackIndex() { return editingTrackIndex; },
		get trackDraftMode() { return trackDraftMode; },
		get isSnappingEnabled() { return isSnappingEnabled; },
		get isRoutingTrack() { return isRoutingTrack; },
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
