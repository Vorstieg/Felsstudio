import { createTrackGestureController } from '$lib/components/editor/track/track-gesture-controller.ts';
import {
	cloneTrackCoordinates as clone,
	sameTrackCoordinates,
	sameMapCoordinates
} from '../track/track-coordinates.ts';
import { previewTrackJoin } from '$lib/components/editor/track/track-join.ts';
import { parseGpxSegments, type GpxSegment } from '$lib/assets/js/route-path-utils.ts';
import {
	cleanStationaryTrackCoordinates,
	fitCoordinatesBounds,
	reverseCoordinates,
	simplifyTrackCoordinates
} from '$lib/assets/js/track-geometry-utils.ts';
import { getRoutedSegment } from '$lib/components/editor/track/track-drawing.ts';
import {
	nearestTrackPoint,
	nearestTrackSplit,
	type ScreenPoint
} from '$lib/components/editor/track/track-interactions.ts';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Point2D } from '@vorstieg/fels-types/types';

import type {
	TrackDraftMode,
	RoutePathTarget,
	ActiveTrackTarget,
	TrackOperation
} from './crag-track-types.ts';
import type { CragTrackPersistence } from './create-crag-track-persistence.ts';
import {
	queryCragFeatures,
	trackTargetFromProperties,
	canJoinTrackTargets,
	trackHitRadius
} from './crag-map-hit-testing.ts';
type Snapshot = {
	points: Point2D[];
	mode: TrackDraftMode;
	tails: Point2D[][];
};
export type CragTrackEditorOptions = {
	persistence: CragTrackPersistence;
	getMap: () => MapLibreMap | null | undefined;
	getActiveTool: () => string;
	setActiveTool: (tool: string) => void;
	setActiveTab?: (tab: string) => void;
	getRoutePathTarget?: () => RoutePathTarget | null;
	onRoutePathDrawingEnd?: () => void;
	onPathFinished?: () => void;
	onPathCancelled?: () => void;
	onTrackPointDragStart?: () => void;
	onTrackPointDragEnd?: () => void;
	onShowOptions?: () => void;
	onTransitionBlocked?: () => void;
};

/** One draft transaction, shared by approach and topo-path persistence adapters. */
export function useCragTrackEditor(options: CragTrackEditorOptions) {
	const {
		persistence,
		getMap,
		getActiveTool,
		setActiveTool,
		getRoutePathTarget = () => null
	} = options;
	const getFeature = persistence.get;
	let points = $state<Point2D[]>([]);
	let tails = $state<Point2D[][]>([]);
	let activeTrackTarget = $state<ActiveTrackTarget | null>(null);
	let mode = $state<TrackDraftMode>('routing');
	let sessionActive = $state(false);
	let originalPoints = $state<Point2D[]>([]);
	let name = $state('');
	let history = $state<Snapshot[]>([]);
	let redoHistory = $state<Snapshot[]>([]);
	let selected = $state<number[]>([]);
	let anchor = $state<number | null>(null);
	let multiSelect = $state(false);
	let rangePending = $state(false);
	let midpointSelected = $state<number | null>(null);
	let operation = $state<TrackOperation>({ kind: 'idle' });
	const geometryPreview = $derived(
		operation.kind === 'trim' ? operation : operation.kind === 'split' ? operation.preview : null
	);
	const joinPreview = $derived(operation.kind === 'join' ? operation.preview : null);
	let message = $state('');
	let isRoutingTrack = $state(false);
	let importSegments = $state<GpxSegment[]>([]);
	let importName = '';
	let requestVersion = 0;
	let routeAbort: AbortController | null = null;
	let routeQueue: Promise<void> = Promise.resolve();
	let queuedPoints = $state(0);
	let failedPoint = $state<Point2D | null>(null);
	let gestures: ReturnType<typeof createTrackGestureController<Snapshot>> | null = null;
	let dragPreview = $state<Point2D[] | null>(null);

	function snapshot(): Snapshot {
		return { points: clone(points), mode, tails: tails.map(clone) };
	}
	function record() {
		history = [...history, snapshot()];
		redoHistory = [];
	}
	function restore(value: Snapshot) {
		points = clone(value.points);

		mode = value.mode;
		tails = value.tails.map(clone);
		clearTrackSelection();
	}
	function invalidateRouting() {
		requestVersion++;
		routeAbort?.abort();
		routeAbort = null;
		routeQueue = Promise.resolve();
		queuedPoints = 0;
		isRoutingTrack = false;
		failedPoint = null;
	}
	function clearTrackSelection() {
		selected = [];
		anchor = null;
		midpointSelected = null;
		rangePending = false;
	}
	function cancelOperation() {
		if (operation.kind === 'join') message = '';
		operation = { kind: 'idle' };
		gestures?.cancel();
	}
	function resetDraft() {
		invalidateRouting();
		cancelOperation();
		sessionActive = false;
		points = [];
		originalPoints = [];

		tails = [];
		activeTrackTarget = null;
		history = [];
		redoHistory = [];
		clearTrackSelection();
		importSegments = [];
		message = '';
	}
	function begin(
		coordinates: Point2D[],
		target: ActiveTrackTarget | null,
		label: string,
		nextMode: TrackDraftMode
	) {
		resetDraft();
		sessionActive = true;
		points = clone(coordinates);
		originalPoints = clone(coordinates);
		activeTrackTarget = target;
		name = label;
		mode = nextMode;
		multiSelect = false;
		setActiveTool('track');
		options.onShowOptions?.();
	}
	const isDirty = () =>
		sessionActive &&
		(tails.length > 0 ||
			!sameTrackCoordinates(points, originalPoints) ||
			(!activeTrackTarget && points.length > 0) ||
			Boolean(
				activeTrackTarget?.kind === 'route-path' && activeTrackTarget.isNew && points.length
			));
	/** Apply valid edits before changing targets; incomplete work stays available. */
	function requestLeave(action: () => void) {
		if (sessionActive) {
			if (operation.kind !== 'idle' || queuedPoints || importSegments.length || failedPoint) {
				message = 'track.completeOperation';
				options.onTransitionBlocked?.();
				return false;
			}
			if (isDirty()) {
				if (points.length < 2) {
					message = 'track.incompleteTrack';
					options.onTransitionBlocked?.();
					return false;
				}
				if (!finalizeTrack()) return false;
			} else cancelTrackEdit();
		}
		action();
		return true;
	}
	function startRoutingDraft() {
		const target = getRoutePathTarget();
		begin([], target ? { kind: 'route-path', ...target } : null, 'track.new', 'routing');
	}
	function editTrack(id: string) {
		const target: ActiveTrackTarget = { kind: 'access', featureId: id };
		const feature = getFeature(target);
		if (!feature?.geometry?.coordinates?.length) return;
		requestLeave(() =>
			begin(
				feature.geometry!.coordinates,
				target,
				feature.properties?.name || 'track.approach',
				'select'
			)
		);
	}
	function editRoutePath(coordinates: Point2D[]) {
		const target = getRoutePathTarget();
		begin(
			coordinates,
			target ? { kind: 'route-path', ...target } : null,
			(target ? getFeature({ kind: 'route-path', ...target })?.properties?.name : null) ||
				'track.routePath',
			coordinates.length ? 'select' : 'routing'
		);
	}
	function setTrackDraftMode(next: TrackDraftMode) {
		if (next === mode) return;
		invalidateRouting();
		cancelOperation();
		clearTrackSelection();
		mode = next;

		message = '';
	}
	function toggleTrackPointSelection(
		index: number,
		{ range = false, toggle = true }: { range?: boolean; toggle?: boolean } = {}
	) {
		if (!Number.isInteger(index) || !points[index]) return false;
		if (range && anchor !== null) {
			const [first, last] = [anchor, index].sort((a, b) => a - b);
			selected = Array.from(
				new Set([
					...selected,
					...Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
				])
			);
		} else if (toggle)
			selected = selected.includes(index)
				? selected.filter((item) => item !== index)
				: [...selected, index];
		else selected = [index];
		anchor = index;
		midpointSelected = null;
		return true;
	}
	function deleteSelectedTrackPoints() {
		if (
			!selected.length ||
			points.length - selected.length < 2 ||
			operation.kind !== 'idle' ||
			queuedPoints
		)
			return false;
		record();
		points = points.filter((_, index) => !selected.includes(index));

		clearTrackSelection();
		return true;
	}
	function removeTrackPoint(index: number) {
		if (points.length <= 2 || !points[index]) return false;
		record();
		points = points.filter((_, at) => at !== index);
		clearTrackSelection();
		return true;
	}
	function insertTrackPoint(index: number, coordinate: Point2D) {
		if (index < 1 || index >= points.length || !coordinate.every(Number.isFinite)) return false;
		record();
		points = [...points.slice(0, index), coordinate, ...points.slice(index)];
		selected = [index];
		return true;
	}
	function undoTrackPoint() {
		if (queuedPoints) return false;
		cancelOperation();
		const previous = history.at(-1);
		if (!previous) return false;
		redoHistory = [...redoHistory, snapshot()];
		history = history.slice(0, -1);
		restore(previous);
		return true;
	}
	function redoTrackPoint() {
		if (queuedPoints) return false;
		cancelOperation();
		const next = redoHistory.at(-1);
		if (!next) return false;
		history = [...history, snapshot()];
		redoHistory = redoHistory.slice(0, -1);
		restore(next);
		return true;
	}
	function useEditedTrackPoints(next: Point2D[]) {
		record();
		points = clone(next);

		mode = 'select';
		clearTrackSelection();
	}
	function reverseTrack() {
		if (points.length < 2 || tails.length || operation.kind !== 'idle' || queuedPoints)
			return false;
		useEditedTrackPoints(reverseCoordinates(points));
		return true;
	}
	function trimTrackStart(index: number) {
		if (!Number.isInteger(index) || index <= 0 || points.length - index < 2) return false;
		operation = { kind: 'trim', points: clone(points.slice(index)), tails: tails.map(clone) };
		return true;
	}
	function trimTrackEnd(index: number) {
		if (!Number.isInteger(index) || index < 1 || index >= points.length - 1) return false;
		operation = {
			kind: 'trim',
			points: clone(points.slice(0, index + 1)),
			tails: tails.map(clone)
		};
		return true;
	}
	function simplifySelectedTrackCoordinates(
		points: Point2D[],
		selectedIndexes: Set<number>,
		tolerance: number
	): Point2D[] {
		const simplified: Point2D[] = [];
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
	function simplifyTrack(toleranceMeters: number) {
		const tolerance = Math.max(1, Number(toleranceMeters) || 1);
		if (operation.kind !== 'idle' || queuedPoints || tails.length)
			return { changed: false, pointCount: points.length, tolerance };
		const next = selected.length
			? simplifySelectedTrackCoordinates(points, new Set(selected), tolerance)
			: simplifyTrackCoordinates(points, tolerance);
		const previousPointCount = points.length;
		if (next.length >= points.length || next.length < 2)
			return { changed: false, pointCount: points.length, tolerance };
		useEditedTrackPoints(next);
		return { changed: true, pointCount: next.length, previousPointCount, tolerance };
	}
	function cleanTrackPauses(radiusMeters: number, minimumPoints: number) {
		const radius = Math.max(1, Number(radiusMeters) || 1),
			minimum = Math.max(3, Math.round(Number(minimumPoints) || 3));
		const previousPointCount = points.length;
		if (operation.kind !== 'idle' || queuedPoints || tails.length)
			return { changed: false, pointCount: points.length, radius, minimum };
		const next = cleanStationaryTrackCoordinates(points, {
			radiusMeters: radius,
			minimumPoints: minimum
		}) as Point2D[];
		if (next.length >= points.length || next.length < 2)
			return { changed: false, pointCount: points.length, radius, minimum };
		useEditedTrackPoints(next);
		return { changed: true, pointCount: next.length, previousPointCount, radius, minimum };
	}
	function addTrackPoint(coordinate: Point2D): Promise<void> {
		if (
			!sessionActive ||
			!['routing', 'editing'].includes(mode) ||
			operation.kind !== 'idle' ||
			tails.length ||
			failedPoint
		)
			return Promise.resolve();
		const version = requestVersion,
			requestedMode = mode;
		queuedPoints++;
		routeQueue = routeQueue
			.then(async () => {
				if (version !== requestVersion || failedPoint) return;
				const before = snapshot();
				try {
					let next = [...points, coordinate];
					if (requestedMode === 'routing' && points.length) {
						isRoutingTrack = true;
						routeAbort = new AbortController();
						const route = await getRoutedSegment(
							points[points.length - 1],
							coordinate,
							routeAbort.signal
						);
						if (version !== requestVersion) return;
						next = [...points, ...route.slice(1)];
					}
					if (version !== requestVersion) return;
					history = [...history, before];
					redoHistory = [];
					points = next;

					message = '';
				} catch {
					if (version === requestVersion) {
						failedPoint = coordinate;
						message = 'track.routingFailed';
					}
				} finally {
					if (version === requestVersion) {
						isRoutingTrack = false;
						routeAbort = null;
					}
				}
			})
			.finally(() => {
				if (version === requestVersion) queuedPoints--;
			});
		return routeQueue;
	}
	function retryRouting() {
		const next = failedPoint;
		failedPoint = null;
		if (next) void addTrackPoint(next);
	}
	function useStraightSegment() {
		if (!failedPoint || queuedPoints) return;
		record();
		points = [...points, failedPoint];

		failedPoint = null;
		message = '';
	}
	function startBoxSelection() {
		cancelOperation();
		operation = { kind: 'box', start: null, end: null, preview: null };
	}
	function startTrackJoin() {
		if (
			!sessionActive ||
			!activeTrackTarget ||
			points.length < 2 ||
			tails.length ||
			queuedPoints ||
			failedPoint ||
			importSegments.length ||
			operation.kind !== 'idle' ||
			(activeTrackTarget.kind === 'route-path' && activeTrackTarget.isNew)
		)
			return;
		cancelOperation();
		clearTrackSelection();
		mode = 'select';
		operation = { kind: 'join', preview: null };
		message = '';
	}
	function previewJoinTrack(event: MapMouseEvent) {
		const map = getMap(),
			base = activeTrackTarget;
		if (!map || !base) return;
		const resultName = joinPreview?.name;
		operation = { kind: 'join', preview: null };
		const hits = queryCragFeatures(map, event.point, true);
		for (const hit of hits) {
			const target = trackTargetFromProperties(hit.properties || {});
			if (!target || !canJoinTrackTargets(base, target)) continue;
			const feature = getFeature(target);
			if (feature?.geometry?.type !== 'LineString') continue;
			const candidatePoints = clone(feature.geometry.coordinates);
			const preview = previewTrackJoin(points, candidatePoints);
			if (!preview) continue;
			operation = {
				kind: 'join',
				preview: {
					...preview,
					target,
					candidatePoints,
					targetName: feature.properties?.name || '',
					name: resultName ?? (name.startsWith('track.') ? '' : name)
				}
			};
			message = '';
			options.onShowOptions?.();
			return;
		}
		message = base.kind === 'access' ? 'track.joinChooseApproach' : 'track.joinChoosePath';
		options.onTransitionBlocked?.();
	}
	function confirmJoinTrack() {
		const preview = joinPreview,
			base = activeTrackTarget;
		if (!preview || !base || operation.kind !== 'join') return false;
		const original = getFeature(base),
			candidate = getFeature(preview.target);
		if (
			original?.geometry?.type !== 'LineString' ||
			candidate?.geometry?.type !== 'LineString' ||
			!sameMapCoordinates(original.geometry.coordinates, originalPoints) ||
			!sameMapCoordinates(candidate.geometry.coordinates, preview.candidatePoints)
		) {
			message = 'track.joinChanged';
			options.onTransitionBlocked?.();
			return false;
		}
		const resultName =
			preview.name.trim() || original.properties?.name || candidate.properties?.name || 'Track';
		const saved = persistence.join({
			base,
			candidate: preview.target,
			points: clone(preview.points),
			name: resultName
		});
		if (!saved) {
			message = 'track.saveFailed';
			options.onTransitionBlocked?.();
			return false;
		}
		finishSession();
		return true;
	}
	function startTrackSplit() {
		if (points.length < 2 || tails.length || queuedPoints) return;
		cancelOperation();
		operation = { kind: 'split', preview: null };
	}
	function previewSplit(at: ScreenPoint) {
		const map = getMap();
		if (!map) return;
		const split = nearestTrackSplit(points, at, map);
		if (split) {
			operation = {
				kind: 'split',
				preview: {
					points: clone(split.first),
					tails: [clone(split.second)],
					coordinate: split.coordinate
				}
			};
			message = '';
		} else message = 'track.splitMiss';
	}
	function confirmOperation(): boolean {
		if (operation.kind === 'join') return confirmJoinTrack();
		if (operation.kind === 'box' && operation.preview !== null) {
			selected = operation.preview;
			cancelOperation();
			return true;
		}
		if (!geometryPreview) return false;
		record();
		points = clone(geometryPreview.points);
		tails = geometryPreview.tails.map(clone);
		mode = 'select';
		clearTrackSelection();
		cancelOperation();
		return true;
	}
	function finalizeTrack(): boolean {
		if (
			points.length < 2 ||
			queuedPoints ||
			operation.kind !== 'idle' ||
			importSegments.length ||
			failedPoint
		)
			return false;
		const saved = persistence.save({
			target: activeTrackTarget,
			segments: [clone(points), ...tails.map(clone)],
			name: name.startsWith('track.') ? '' : name
		});
		if (!saved) {
			message = 'track.saveFailed';
			options.onTransitionBlocked?.();
			return false;
		}
		finishSession();
		return true;
	}
	function finishSession() {
		resetDraft();
		options.onRoutePathDrawingEnd?.();
		setActiveTool('select');
		options.setActiveTab?.('registry');
		options.onPathFinished?.();
	}
	function cancelTrackEdit() {
		resetDraft();
		options.onRoutePathDrawingEnd?.();
		setActiveTool('select');
		options.onPathCancelled?.();
	}
	function removeTrack(id: string) {
		requestLeave(() => {
			persistence.remove({ kind: 'access', featureId: id });
		});
	}
	function fitTrackBounds(coordinates = points) {
		const mobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
		fitCoordinatesBounds(getMap(), coordinates, {
			padding: mobile
				? { top: 90, left: 35, right: 35, bottom: Math.min(window.innerHeight * 0.6, 440) }
				: { top: 100, left: 350, right: 350, bottom: 60 }
		});
	}
	async function handleGpxUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement,
			file = input.files?.[0];
		if (!file) return;
		const version = requestVersion,
			importTarget = getRoutePathTarget();
		try {
			const segments = parseGpxSegments(await file.text());
			if (version !== requestVersion || !requestLeave(() => {})) return;
			{
				const target = importTarget;
				begin(
					[],
					target ? { kind: 'route-path', ...target } : null,
					file.name.replace(/\.gpx$/i, ''),
					'select'
				);
				importName = file.name.replace(/\.gpx$/i, '');
				if (segments.length === 1) importSegment(segments[0]);
				else importSegments = segments;
			}
		} catch {
			message = 'track.invalidGpx';
		} finally {
			input.value = '';
		}
	}
	function importSegment(segment: GpxSegment) {
		points = clone(segment.points);
		originalPoints = [];
		name = importName;
		importSegments = [];
		mode = 'select';
		fitTrackBounds();
	}
	function cancelImport() {
		importSegments = [];
		cancelTrackEdit();
	}
	function handleMapClick(event: MapMouseEvent): boolean {
		if (!sessionActive || getActiveTool() !== 'track') return false;
		if (gestures?.consumeClick(event.point)) return true;
		if (importSegments.length) return true;
		if (operation.kind === 'join') {
			previewJoinTrack(event);
			return true;
		}
		if (operation.kind === 'split') {
			previewSplit(event.point);
			return true;
		}
		if (operation.kind === 'box') {
			if (!operation.start || operation.preview !== null)
				startBoxAt([event.lngLat.lng, event.lngLat.lat]);
			else {
				operation.end = [event.lngLat.lng, event.lngLat.lat];
				updateBoxPreview();
				confirmOperation();
			}
			return true;
		}
		if (operation.kind !== 'idle') return true;
		const map = getMap();
		if (!map) return true;
		if (mode === 'select') {
			const touch =
				'pointerType' in event.originalEvent && event.originalEvent.pointerType === 'touch';
			const radius = trackHitRadius(touch ? 'touch' : undefined);
			const index = nearestTrackPoint(points, event.point, map, radius);
			if (index !== null) {
				const awaitingFirst = rangePending && anchor === null;
				toggleTrackPointSelection(index, {
					range: event.originalEvent.shiftKey || rangePending,
					toggle: event.originalEvent.ctrlKey || event.originalEvent.metaKey || multiSelect
				});
				rangePending = awaitingFirst;
			} else {
				const midpoints = points
					.slice(1)
					.map((point, index): Point2D => [
						(point[0] + points[index][0]) / 2,
						(point[1] + points[index][1]) / 2
					]);
				const midpoint = nearestTrackPoint(midpoints, event.point, map, radius);
				clearTrackSelection();
				midpointSelected = midpoint === null ? null : midpoint + 1;
			}
			return true;
		}
		return false;
	}
	function startBoxAt(coordinate: Point2D) {
		operation = { kind: 'box', start: coordinate, end: null, preview: null };
	}
	function updateBoxPreview() {
		const map = getMap();
		if (!map || operation.kind !== 'box' || !operation.start || !operation.end) return;
		const a = map.project(operation.start),
			b = map.project(operation.end);
		operation.preview = points.flatMap((point, index) => {
			const at = map.project(point);
			return at.x >= Math.min(a.x, b.x) &&
				at.x <= Math.max(a.x, b.x) &&
				at.y >= Math.min(a.y, b.y) &&
				at.y <= Math.max(a.y, b.y)
				? [index]
				: [];
		});
	}
	function initTrackPointDragHandlers() {
		const map = getMap();
		if (!map || gestures?.map === map) return;
		cleanup();
		gestures = createTrackGestureController({
			map,
			getState: () => ({
				enabled:
					sessionActive && getActiveTool() === 'track' && !queuedPoints && !importSegments.length,
				canEditPoints: mode === 'select' && operation.kind === 'idle' && !rangePending,
				points,
				selectedIndexes: selected,
				boxSelecting: operation.kind === 'box',
				splitCoordinate: operation.kind === 'split' ? (geometryPreview?.coordinate ?? null) : null
			}),
			snapshot,
			onTapPoint: (index) => {
				toggleTrackPointSelection(index, { toggle: multiSelect });
			},
			onTapMidpoint: (index) => {
				clearTrackSelection();
				midpointSelected = index;
			},
			onPreviewPoints: (preview, indexes) => {
				dragPreview = preview;
				if (indexes) selected = indexes;
			},
			onCommitPoints: (before, preview, insertedIndex) => {
				history = [...history, before];
				redoHistory = [];
				points = clone(preview);
				if (insertedIndex !== null) selected = [insertedIndex];
			},
			onBoxStart: startBoxAt,
			onBoxEnd: (coordinate) => {
				if (operation.kind === 'box') operation.end = coordinate;
			},
			onBoxConfirm: () => {
				updateBoxPreview();
				confirmOperation();
			},
			onBoxCancel: () => {
				if (operation.kind === 'box')
					operation = { kind: 'box', start: null, end: null, preview: null };
			},
			onSplitPreview: previewSplit,
			onDragStart: () => options.onTrackPointDragStart?.(),
			onDragEnd: () => options.onTrackPointDragEnd?.()
		});
	}
	function cleanup() {
		invalidateRouting();
		gestures?.destroy();
		gestures = null;
	}
	function canApply() {
		return (
			sessionActive &&
			points.length >= 2 &&
			!queuedPoints &&
			operation.kind === 'idle' &&
			!importSegments.length &&
			!failedPoint
		);
	}
	function primaryAction() {
		if (!sessionActive) return null;
		let label: string, disabled: boolean;
		switch (operation.kind) {
			case 'join':
				label = 'track.join';
				disabled = !operation.preview;
				break;
			case 'split':
				label = 'track.applySplit';
				disabled = !operation.preview;
				break;
			case 'trim':
				label = 'track.applyTrim';
				disabled = false;
				break;
			case 'box':
				label = 'track.useSelection';
				disabled = operation.preview === null;
				break;
			default:
				label = 'track.done';
				disabled = !canApply();
		}
		return {
			label,
			disabled,
			placement: operation.kind === 'join' ? 'panel' : 'toolbar',
			run: operation.kind === 'idle' ? finalizeTrack : confirmOperation
		};
	}
	function handleKeyDown(event: KeyboardEvent) {
		if (
			!sessionActive ||
			(event.target instanceof Element &&
				event.target.closest('input, textarea, select, [contenteditable="true"]'))
		)
			return false;
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) redoTrackPoint();
			else undoTrackPoint();
			return true;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redoTrackPoint();
			return true;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			if (event.key === 'Backspace' && mode !== 'select') undoTrackPoint();
			else deleteSelectedTrackPoints();
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			if (operation.kind !== 'idle') cancelOperation();
			else if (selected.length || midpointSelected !== null || rangePending) clearTrackSelection();
			else requestLeave(() => {});
			return true;
		}
		if (event.key === 'Enter' || event.key.toLowerCase() === 'n') {
			event.preventDefault();
			const action = primaryAction();
			if (action && !action.disabled) action.run();
			return true;
		}
		return false;
	}
	return {
		get currentTrackPoints() {
			return dragPreview || geometryPreview?.points || points;
		},
		get draftPoints() {
			return points;
		},
		get draftTails() {
			return geometryPreview?.tails || tails;
		},
		get activeTrackTarget() {
			return activeTrackTarget;
		},
		get trackDraftMode() {
			return mode;
		},
		get isRoutingTrack() {
			return isRoutingTrack || queuedPoints > 0;
		},
		get hasRoutingFailure() {
			return failedPoint !== null;
		},
		get sessionActive() {
			return sessionActive;
		},
		get isDirty() {
			return isDirty();
		},
		get trackName() {
			return name;
		},
		get canUndo() {
			return history.length > 0 && queuedPoints === 0;
		},
		get canRedo() {
			return redoHistory.length > 0 && queuedPoints === 0;
		},
		get canApply() {
			return canApply();
		},
		get selectedTrackPointIndex() {
			return selected.length === 1 ? selected[0] : null;
		},
		get selectedTrackPointIndexes() {
			return selected;
		},
		get selectedTrackPointCount() {
			return selected.length;
		},
		get multiSelect() {
			return multiSelect;
		},
		setMultiSelect(value: boolean) {
			multiSelect = value;
		},
		get rangePending() {
			return rangePending;
		},
		startRangeSelection() {
			rangePending = true;
			anchor = selected.length === 1 ? selected[0] : null;
		},
		get midpointSelected() {
			return midpointSelected;
		},
		get operation() {
			return operation;
		},
		get geometryPreview() {
			return geometryPreview;
		},
		get primaryAction() {
			return primaryAction();
		},
		get cancelAction() {
			return sessionActive
				? {
						label: operation.kind === 'idle' ? 'track.discard' : 'ui.cancel',
						run: operation.kind === 'idle' ? cancelTrackEdit : cancelOperation
					}
				: null;
		},
		instructionKey(isExpanded: boolean) {
			switch (operation.kind) {
				case 'join':
					return 'track.joinHelp';
				case 'box':
					return 'track.boxHelp';
				case 'split':
					return 'track.splitHelp';
				case 'trim':
					return 'track.trimHelp';
			}
			return rangePending
				? 'track.rangeHelp'
				: mode === 'select'
					? isExpanded
						? 'track.editHelp'
						: 'track.touchEditHelp'
					: mode === 'editing'
						? 'track.manualHelp'
						: 'track.followHelp';
		},
		get message() {
			return message;
		},
		get importSegments() {
			return importSegments;
		},
		requestLeave,
		handleMapClick,
		handleKeyDown,
		startBoxSelection,
		startTrackSplit,
		startTrackJoin,
		confirmJoinTrack,
		get joinPreview() {
			return joinPreview;
		},
		setJoinName(value: string) {
			if (joinPreview) joinPreview.name = value;
		},
		confirmOperation,
		cancelOperation,
		addTrackPoint,
		startRoutingDraft,
		setTrackDraftMode,
		undoTrackPoint,
		redoTrackPoint,
		insertTrackPoint,
		removeTrackPoint,
		clearTrackSelection,
		toggleTrackPointSelection,
		deleteSelectedTrackPoints,
		reverseTrack,
		trimTrackStart,
		trimTrackEnd,
		simplifyTrack,
		cleanTrackPauses,
		removeTrack,
		finalizeTrack,
		editTrack,
		editRoutePath,
		cancelTrackEdit,
		handleGpxUpload,
		importSegment,
		cancelImport,
		retryRouting,
		useStraightSegment,
		fitTrackBounds,
		initTrackPointDragHandlers,
		cleanup
	};
}
