/** Finds the closest placed fixed point within the route snapping radius. */
export function snapRoutePointToFixpoint(
	point,
	fixPoints = [],
	{ enabled = false, thresholdPx = 18, canvasSize } = {}
) {
	if (!enabled || !canvasSize?.baseWidth || !canvasSize?.baseHeight) {
		return { point, fixPointId: null };
	}

	const thresholdX = thresholdPx / canvasSize.baseWidth;
	const thresholdY = thresholdPx / canvasSize.baseHeight;
	let closest = null;
	let closestDistance = Infinity;

	for (const fixPoint of fixPoints) {
		const [x, y] = fixPoint.position2D || [];
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		const distance = Math.hypot((point.x - x) / thresholdX, (point.y - y) / thresholdY);
		if (distance <= 1 && distance < closestDistance) {
			closest = fixPoint;
			closestDistance = distance;
		}
	}

	return closest
		? { point: { x: closest.position2D[0], y: closest.position2D[1] }, fixPointId: closest.id }
		: { point, fixPointId: null };
}

/** Adds a fixed-point reference once while keeping legacy routes compatible. */
export function referenceFixpoint(route, fixPointId) {
	if (!route || !fixPointId) return;
	if (!route.fixPoints) route.fixPoints = [];
	if (!route.fixPoints.includes(fixPointId)) route.fixPoints = [...route.fixPoints, fixPointId];
}
