import type { FixPoint, Route } from '@vorstieg/fels-types/types';
import type { InteractionId, InteractionPoint } from '$lib/state/topo-2d-editor-interactions.ts';

const ROUTE_ANCHOR_TYPES = new Set(['belay', 'abseil', 'abseil-left', 'abseil-right']);

type CanvasSize = { baseWidth: number; baseHeight: number };
type SnapOptions = {
	enabled?: boolean;
	thresholdPx?: number;
	canvasSize?: CanvasSize;
};
type SnapResult = { point: InteractionPoint; anchorId: InteractionId | null };

/** Finds the closest placed belay or abseil anchor within the route snapping radius. */
export function snapRoutePointToAnchor(
	point: InteractionPoint,
	anchors: readonly FixPoint[] = [],
	{ enabled = false, thresholdPx = 18, canvasSize }: SnapOptions = {}
): SnapResult {
	if (!enabled || !canvasSize?.baseWidth || !canvasSize?.baseHeight) {
		return { point, anchorId: null };
	}

	const thresholdX = thresholdPx / canvasSize.baseWidth;
	const thresholdY = thresholdPx / canvasSize.baseHeight;
	let closest: FixPoint | null = null;
	let closestDistance = Infinity;

	for (const anchor of anchors) {
		if (!ROUTE_ANCHOR_TYPES.has(anchor.type)) continue;
		const position = anchor.position2D;
		if (!position) continue;
		const [x, y] = position;
		if (
			typeof x !== 'number' ||
			typeof y !== 'number' ||
			!Number.isFinite(x) ||
			!Number.isFinite(y)
		)
			continue;
		const distance = Math.hypot((point.x - x) / thresholdX, (point.y - y) / thresholdY);
		if (distance <= 1 && distance < closestDistance) {
			closest = anchor;
			closestDistance = distance;
		}
	}

	return closest?.position2D
		? { point: { x: closest.position2D[0], y: closest.position2D[1] }, anchorId: closest.id }
		: { point, anchorId: null };
}

/** Adds a fixed-point reference once. */
export function referenceFixpoint(route: Route, fixPointId: InteractionId | null): void {
	if (fixPointId == null) return;
	const fixPoints = route.fixPoints || [];
	if (!fixPoints.includes(fixPointId)) route.fixPoints = [...fixPoints, fixPointId];
}
