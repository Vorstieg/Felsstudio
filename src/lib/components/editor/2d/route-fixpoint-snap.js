const ROUTE_ANCHOR_TYPES = new Set(['belay', 'abseil']);

/** Finds the closest placed belay or abseil anchor within the route snapping radius. */
export function snapRoutePointToAnchor(
	point,
	anchors = [],
	{ enabled = false, thresholdPx = 18, canvasSize } = {}
) {
	if (!enabled || !canvasSize?.baseWidth || !canvasSize?.baseHeight) {
		return { point, anchorId: null };
	}

	const thresholdX = thresholdPx / canvasSize.baseWidth;
	const thresholdY = thresholdPx / canvasSize.baseHeight;
	let closest = null;
	let closestDistance = Infinity;

	for (const anchor of anchors) {
		if (!ROUTE_ANCHOR_TYPES.has(anchor.type)) continue;
		const [x, y] = anchor.position2D || [];
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		const distance = Math.hypot((point.x - x) / thresholdX, (point.y - y) / thresholdY);
		if (distance <= 1 && distance < closestDistance) {
			closest = anchor;
			closestDistance = distance;
		}
	}

	return closest
		? { point: { x: closest.position2D[0], y: closest.position2D[1] }, anchorId: closest.id }
		: { point, anchorId: null };
}

/** Adds a fixed-point reference once while keeping legacy routes compatible. */
export function referenceFixpoint(route, fixPointId) {
	if (!route || !fixPointId) return;
	if (!route.fixPoints) route.fixPoints = [];
	if (!route.fixPoints.includes(fixPointId)) route.fixPoints = [...route.fixPoints, fixPointId];
}
