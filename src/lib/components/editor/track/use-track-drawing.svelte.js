import {
	appendTrackPointToDraft,
	buildRoutedDraft
} from '$lib/components/editor/track/track-drawing.js';

export function useTrackDrawing({
	initialMode = 'routing',
	onPointsChange = () => {},
	onRouteStart = () => {},
	onRouteEnd = () => {}
} = {}) {
	let points = $state([]);
	let waypoints = $state([]);
	let mode = $state(initialMode); // 'routing' | 'freestyle' | 'editing'
	let isRouting = $state(false);

	async function addPoint(lngLat) {
		const currentWaypoints = $state.snapshot(waypoints);
		const currentPoints = $state.snapshot(points);
		isRouting = mode === 'routing' && currentWaypoints.length > 0;
		if (isRouting) onRouteStart();
		const draft = await appendTrackPointToDraft({
			trackDraftMode: mode === 'freestyle' ? 'editing' : mode,
			waypoints: currentWaypoints,
			points: currentPoints,
			lngLat
		});
		isRouting = false;
		onRouteEnd();
		waypoints = draft.waypoints;
		points = draft.points;
		onPointsChange($state.snapshot(points));
	}

	async function rebuildRouted(nextWaypoints) {
		waypoints = nextWaypoints;
		isRouting = nextWaypoints.length >= 2;
		if (isRouting) onRouteStart();
		points = await buildRoutedDraft(nextWaypoints);
		isRouting = false;
		onRouteEnd();
		onPointsChange($state.snapshot(points));
	}

	function undoPoint() {
		if (mode === 'routing') {
			const currentWaypoints = $state.snapshot(waypoints);
			if (currentWaypoints.length === 0) return;
			rebuildRouted(currentWaypoints.slice(0, -1));
			return;
		}
		if (points.length > 0) {
			points = points.slice(0, -1);
			onPointsChange($state.snapshot(points));
		}
	}

	function setPoints(nextPoints = [], nextMode = mode) {
		points = nextPoints.map((point) => [...point]);
		waypoints = nextMode === 'routing' && points.length > 0 ? [points.at(-1)] : [];
		mode = nextMode;
		onPointsChange($state.snapshot(points));
	}

	function clear(nextMode = initialMode) {
		points = [];
		waypoints = [];
		mode = nextMode;
		onPointsChange([]);
	}

	return {
		get points() {
			return points;
		},
		get waypoints() {
			return waypoints;
		},
		get mode() {
			return mode;
		},
		set mode(value) {
			mode = value;
		},
		get isRouting() {
			return isRouting;
		},
		addPoint,
		undoPoint,
		rebuildRouted,
		setPoints,
		clear
	};
}
