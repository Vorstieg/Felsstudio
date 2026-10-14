import { cloneTrackCoordinates } from './track-coordinates.ts';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Point2D } from '@vorstieg/fels-types/types';
import { nearestTrackPoint, trackHitRadius, type ScreenPoint } from './track-interactions.ts';

type GestureState = {
	enabled: boolean;
	canEditPoints: boolean;
	points: Point2D[];
	selectedIndexes: number[];
	boxSelecting: boolean;
	splitCoordinate: Point2D | null;
};
type Options<Snapshot> = {
	map: MapLibreMap;
	getState(): GestureState;
	snapshot(): Snapshot;
	onTapPoint(index: number): void;
	onTapMidpoint(index: number): void;
	onPreviewPoints(points: Point2D[] | null, selection?: number[]): void;
	onCommitPoints(before: Snapshot, points: Point2D[], insertedIndex: number | null): void;
	onBoxStart(coordinate: Point2D): void;
	onBoxEnd(coordinate: Point2D): void;
	onBoxConfirm(): void;
	onBoxCancel(): void;
	onSplitPreview(point: ScreenPoint): void;
	onDragStart(): void;
	onDragEnd(): void;
};

/** Owns pointer capture, movement thresholds, map gestures, and trailing click suppression. */
export function createTrackGestureController<Snapshot extends { points: Point2D[] }>(
	options: Options<Snapshot>
) {
	const { map } = options;
	const canvas = map.getCanvas();
	type Gesture = {
		id: number;
		start: ScreenPoint;
		before: Snapshot;
		indexes: number[];
		pointIndex: number | null;
		midpoint: number | null;
		split: boolean;
		box: boolean;
		moved: boolean;
		pan: boolean;
		zoom: boolean;
	};
	let gesture: Gesture | null = null;
	let preview: Point2D[] | null = null;
	let suppressedClick: { point: ScreenPoint; until: number } | null = null;
	const screen = (event: PointerEvent): ScreenPoint => {
		const rect = canvas.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	};
	function finish(cancelled = false) {
		const active = gesture;
		if (!active) return;
		gesture = null;
		if (!cancelled && active.moved) {
			if (active.box) options.onBoxConfirm();
			else if (!active.split && preview)
				options.onCommitPoints(active.before, preview, active.midpoint);
		}
		if (cancelled && active.box) options.onBoxCancel();
		preview = null;
		options.onPreviewPoints(null);
		if (canvas.hasPointerCapture?.(active.id)) canvas.releasePointerCapture(active.id);
		if (active.pan) map.dragPan.enable();
		else map.dragPan.disable();
		if (active.zoom) map.touchZoomRotate.enable();
		else map.touchZoomRotate.disable();
		canvas.style.cursor = '';
		options.onDragEnd();
	}
	function down(event: PointerEvent) {
		if (gesture) {
			finish(true);
			return;
		}
		const state = options.getState();
		if (!state.enabled || (event.button !== 0 && event.pointerType !== 'touch')) return;
		const at = screen(event),
			radius = trackHitRadius(event.pointerType);
		const split =
			state.splitCoordinate &&
			Math.hypot(
				map.project(state.splitCoordinate).x - at.x,
				map.project(state.splitCoordinate).y - at.y
			) <= radius;
		const box = state.boxSelecting && event.pointerType !== 'touch';
		if (
			!split &&
			!box &&
			(!state.canEditPoints || event.shiftKey || event.ctrlKey || event.metaKey)
		)
			return;
		const index = nearestTrackPoint(state.points, at, map, radius);
		const midpoints = state.points
			.slice(1)
			.map((point, i): Point2D => [
				(point[0] + state.points[i][0]) / 2,
				(point[1] + state.points[i][1]) / 2
			]);
		const midpoint = index === null ? nearestTrackPoint(midpoints, at, map, radius) : null;
		if (!split && !box && index === null && midpoint === null) return;
		const indexes =
			index === null
				? []
				: state.selectedIndexes.includes(index)
					? [...state.selectedIndexes]
					: [index];
		gesture = {
			id: event.pointerId,
			start: at,
			before: options.snapshot(),
			indexes,
			pointIndex: index,
			midpoint: midpoint === null ? null : midpoint + 1,
			split: Boolean(split),
			box,
			moved: false,
			pan: map.dragPan.isEnabled(),
			zoom: map.touchZoomRotate.isEnabled()
		};
		if (box) {
			const coordinate = map.unproject([at.x, at.y]);
			options.onBoxStart([coordinate.lng, coordinate.lat]);
		}
		map.dragPan.disable();
		map.touchZoomRotate.disable();
		canvas.setPointerCapture?.(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}
	function move(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.id) return;
		const at = screen(event),
			active = gesture;
		if (!active.moved && Math.hypot(at.x - active.start.x, at.y - active.start.y) < 6) return;
		active.moved = true;
		event.preventDefault();
		event.stopPropagation();
		if (active.split) {
			options.onSplitPreview(at);
			return;
		}
		const coordinate = map.unproject([at.x, at.y]);
		if (active.box) {
			options.onBoxEnd([coordinate.lng, coordinate.lat]);
			return;
		}
		if (active.midpoint !== null) {
			preview = cloneTrackCoordinates(active.before.points);
			preview.splice(active.midpoint, 0, [coordinate.lng, coordinate.lat]);
			options.onPreviewPoints(preview);
		} else {
			const origin = map.unproject([active.start.x, active.start.y]);
			preview = active.before.points.map((point, index): Point2D =>
				active.indexes.includes(index)
					? [point[0] + coordinate.lng - origin.lng, point[1] + coordinate.lat - origin.lat]
					: point
			);
			options.onPreviewPoints(preview, active.indexes);
		}
		canvas.style.cursor = 'move';
		options.onDragStart();
	}
	function up(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.id) return;
		const active = gesture,
			at = screen(event);
		if (!active.moved && !active.split && !active.box) {
			if (active.midpoint !== null) options.onTapMidpoint(active.midpoint);
			else if (active.pointIndex !== null) options.onTapPoint(active.pointIndex);
		}
		suppressedClick = { point: at, until: Date.now() + 500 };
		finish();
		event.preventDefault();
		event.stopPropagation();
	}
	const cancel = () => finish(true);
	canvas.addEventListener('pointerdown', down, true);
	canvas.addEventListener('pointermove', move, true);
	canvas.addEventListener('pointerup', up, true);
	canvas.addEventListener('pointercancel', cancel, true);
	canvas.addEventListener('lostpointercapture', cancel);
	window.addEventListener('blur', cancel);
	return {
		map,
		cancel,
		consumeClick(point: ScreenPoint) {
			const suppressed =
				suppressedClick &&
				Date.now() < suppressedClick.until &&
				Math.hypot(point.x - suppressedClick.point.x, point.y - suppressedClick.point.y) < 12;
			suppressedClick = null;
			return Boolean(suppressed);
		},
		destroy() {
			cancel();
			suppressedClick = null;
			canvas.removeEventListener('pointerdown', down, true);
			canvas.removeEventListener('pointermove', move, true);
			canvas.removeEventListener('pointerup', up, true);
			canvas.removeEventListener('pointercancel', cancel, true);
			canvas.removeEventListener('lostpointercapture', cancel);
			window.removeEventListener('blur', cancel);
		}
	};
}
