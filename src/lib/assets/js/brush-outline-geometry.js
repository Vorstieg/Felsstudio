/**
 * Geometry helpers for the brush-to-outline tool.  The editor stores points
 * normalised to the image, but all brush measurements are intentionally made
 * in image pixels so a circular brush stays circular on non-square photos.
 */
export const DEFAULT_BRUSH_RADIUS_PX = 18;
export const DEFAULT_BRUSH_SIMPLIFY_TOLERANCE_PX = 2;

function canvasMetrics(canvasSize = {}) {
	return {
		width: Math.max(Number(canvasSize.baseWidth) || 1, 1),
		height: Math.max(Number(canvasSize.baseHeight) || 1, 1)
	};
}

function toPixels([x, y], canvasSize) {
	const { width, height } = canvasMetrics(canvasSize);
	return [x * width, y * height];
}

function fromPixels([x, y], canvasSize) {
	const { width, height } = canvasMetrics(canvasSize);
	return [x / width, y / height];
}

function distance(a, b) {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function equalPoints(a, b, epsilon = 1e-8) {
	return Boolean(a && b && distance(a, b) <= epsilon);
}

function cleanStroke(points, canvasSize, minimumSpacingPx) {
	if (!Array.isArray(points)) return [];
	const cleaned = [];
	for (const point of points) {
		if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
		const pixelPoint = toPixels(point, canvasSize);
		if (!cleaned.length || distance(cleaned.at(-1), pixelPoint) >= minimumSpacingPx) {
			cleaned.push(pixelPoint);
		}
	}
	return cleaned;
}

function pointLineDistance(point, start, end) {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	if (dx === 0 && dy === 0) return distance(point, start);
	return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) /
		Math.hypot(dx, dy);
}

function simplifyOpen(points, tolerance) {
	if (points.length <= 2 || tolerance <= 0) return points;
	let largestDistance = 0;
	let largestIndex = 0;
	for (let index = 1; index < points.length - 1; index++) {
		const candidateDistance = pointLineDistance(points[index], points[0], points.at(-1));
		if (candidateDistance > largestDistance) {
			largestDistance = candidateDistance;
			largestIndex = index;
		}
	}
	if (largestDistance <= tolerance) return [points[0], points.at(-1)];
	const left = simplifyOpen(points.slice(0, largestIndex + 1), tolerance);
	const right = simplifyOpen(points.slice(largestIndex), tolerance);
	return [...left.slice(0, -1), ...right];
}

function signedArea(points) {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const next = points[(index + 1) % points.length];
		area += points[index][0] * next[1] - next[0] * points[index][1];
	}
	return area / 2;
}

function orientation(a, b, c) {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(a, b, c, d) {
	const abC = orientation(a, b, c);
	const abD = orientation(a, b, d);
	const cdA = orientation(c, d, a);
	const cdB = orientation(c, d, b);
	const onSegment = (start, point, end) =>
		point[0] >= Math.min(start[0], end[0]) && point[0] <= Math.max(start[0], end[0]) &&
		point[1] >= Math.min(start[1], end[1]) && point[1] <= Math.max(start[1], end[1]);
	if (abC === 0 && onSegment(a, c, b)) return true;
	if (abD === 0 && onSegment(a, d, b)) return true;
	if (cdA === 0 && onSegment(c, a, d)) return true;
	if (cdB === 0 && onSegment(c, b, d)) return true;
	return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}

/** Returns whether a normalised, closed polygon is safe to turn into an outline. */
export function isValidBrushOutline(points, canvasSize = {}, { minAreaPx = 4 } = {}) {
	if (!Array.isArray(points) || points.length < 4 || !equalPoints(points[0], points.at(-1))) return false;
	const polygon = points.slice(0, -1);
	if (polygon.length < 3 || polygon.some((point) => !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return false;
	const pixels = polygon.map((point) => toPixels(point, canvasSize));
	if (Math.abs(signedArea(pixels)) < minAreaPx) return false;
	for (let index = 0; index < pixels.length; index++) {
		const nextIndex = (index + 1) % pixels.length;
		if (equalPoints(pixels[index], pixels[nextIndex])) return false;
		for (let other = index + 1; other < pixels.length; other++) {
			const otherNext = (other + 1) % pixels.length;
			if (index === other || nextIndex === other || otherNext === index) continue;
			if (segmentsIntersect(pixels[index], pixels[nextIndex], pixels[other], pixels[otherNext])) return false;
		}
	}
	return true;
}

function key(x, y) {
	return `${x},${y}`;
}

function parseKey(value) {
	return value.split(',').map(Number);
}

function simplifyClosed(points, tolerance) {
	if (points.length < 4 || tolerance <= 0) return points;
	let result = [...points];
	// Two linear passes remove raster stair-steps without rounding every
	// corner or performing expensive self-intersection checks per candidate.
	for (let pass = 0; pass < 2 && result.length > 3; pass++) {
		result = result.filter((point, index, current) => {
			const previous = current[(index - 1 + current.length) % current.length];
			const next = current[(index + 1) % current.length];
			return pointLineDistance(point, previous, next) > tolerance;
		});
	}
	return result.length >= 3 ? result : points;
}

function reduceByDistance(points, minimumDistance) {
	if (points.length < 4 || minimumDistance <= 0) return points;
	const reduced = [points[0]];
	for (let index = 1; index < points.length; index++) {
		if (distance(points[index], reduced.at(-1)) >= minimumDistance) reduced.push(points[index]);
	}
	return reduced.length >= 3 ? reduced : points;
}

// A tiny, single-pass corner softening removes the remaining grid feel without
// adding vertices or turning the painted boundary into a spline.
function softenCorners(points, amount = 0.12) {
	if (points.length < 3) return points;
	return points.map((point, index) => {
		const previous = points[(index - 1 + points.length) % points.length];
		const next = points[(index + 1) % points.length];
		return [
			point[0] * (1 - amount * 2) + (previous[0] + next[0]) * amount,
			point[1] * (1 - amount * 2) + (previous[1] + next[1]) * amount
		];
	});
}

function addCircleDab(mask, center, radius, origin, cellSize) {
	const startX = Math.floor((center[0] - radius - origin[0]) / cellSize);
	const endX = Math.ceil((center[0] + radius - origin[0]) / cellSize);
	const startY = Math.floor((center[1] - radius - origin[1]) / cellSize);
	const endY = Math.ceil((center[1] + radius - origin[1]) / cellSize);
	for (let y = startY; y <= endY; y++) {
		for (let x = startX; x <= endX; x++) {
			const sample = [origin[0] + (x + 0.5) * cellSize, origin[1] + (y + 0.5) * cellSize];
			if (distance(sample, center) <= radius) mask.add(key(x, y));
		}
	}
}

function traceLargestMaskBoundary(mask, origin, cellSize) {
	const edges = new Map();
	const addEdge = (start, end) => {
		const startKey = key(...start);
		if (!edges.has(startKey)) edges.set(startKey, []);
		edges.get(startKey).push(end);
	};
	for (const cell of mask) {
		const [x, y] = parseKey(cell);
		// Edges are clockwise in screen coordinates, keeping the filled area on
		// the right. A connected paint mask therefore has one outer loop plus
		// optional (smaller) hole loops.
		if (!mask.has(key(x, y - 1))) addEdge([x, y], [x + 1, y]);
		if (!mask.has(key(x + 1, y))) addEdge([x + 1, y], [x + 1, y + 1]);
		if (!mask.has(key(x, y + 1))) addEdge([x + 1, y + 1], [x, y + 1]);
		if (!mask.has(key(x - 1, y))) addEdge([x, y + 1], [x, y]);
	}
	const loops = [];
	while (edges.size) {
		const firstKey = edges.keys().next().value;
		const first = parseKey(firstKey);
		const loop = [first];
		let current = first;
		let previous = null;
		while (true) {
			const currentKey = key(...current);
			const nexts = edges.get(currentKey);
			if (!nexts?.length) break;
			// At a diagonal touch there can be more than one outgoing edge. Follow
			// the rightmost continuation to keep tracing the same exterior loop.
			let nextIndex = nexts.length - 1;
			if (previous && nexts.length > 1) {
				const incoming = [current[0] - previous[0], current[1] - previous[1]];
				const preference = [
					[-incoming[1], incoming[0]], incoming,
					[incoming[1], -incoming[0]], [-incoming[0], -incoming[1]]
				];
				nextIndex = preference
					.map((direction) => nexts.findIndex((candidate) => candidate[0] - current[0] === direction[0] && candidate[1] - current[1] === direction[1]))
					.find((index) => index >= 0);
			}
			const [next] = nexts.splice(nextIndex, 1);
			if (!nexts.length) edges.delete(currentKey);
			previous = current;
			current = next;
			if (equalPoints(current, first)) break;
			loop.push(current);
			if (loop.length > mask.size * 4) break;
		}
		if (loop.length >= 3 && equalPoints(current, first)) loops.push(loop);
	}
	const largest = loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0];
	return largest?.map(([x, y]) => [origin[0] + x * cellSize, origin[1] + y * cellSize]) ?? [];
}

/**
 * Creates an editable outline from the *painted area*, rather than turning a
 * stroke centreline into a thick line. Each pointer sample is a round paint
 * dab; their union is rasterised on a small local grid and its outer boundary
 * is traced. This also preserves blobs made by scribbling back and forth.
 */
export function createBrushMaskOutline(
	strokePoints,
	{
		brushRadiusPx = DEFAULT_BRUSH_RADIUS_PX,
		canvasSize = {},
		simplifyTolerancePx = DEFAULT_BRUSH_SIMPLIFY_TOLERANCE_PX,
		maskCellSizePx = 2
	} = {}
) {
	if (!Number.isFinite(brushRadiusPx) || brushRadiusPx <= 0) return [];
	const cellSize = Math.max(Number(maskCellSizePx) || 2, 0.5);
	const stroke = cleanStroke(strokePoints, canvasSize, Math.max(cellSize / 2, 0.25));
	if (!stroke.length) return [];
	const minX = Math.min(...stroke.map(([x]) => x)) - brushRadiusPx - cellSize;
	const minY = Math.min(...stroke.map(([, y]) => y)) - brushRadiusPx - cellSize;
	const mask = new Set();
	// Interpolate dab centres, so quick pointer movement never leaves holes.
	for (let index = 0; index < stroke.length; index++) {
		const previous = stroke[Math.max(0, index - 1)];
		const current = stroke[index];
		const steps = Math.max(1, Math.ceil(distance(previous, current) / Math.max(brushRadiusPx / 2, cellSize)));
		for (let step = 0; step <= steps; step++) {
			const ratio = step / steps;
			addCircleDab(mask, [previous[0] + (current[0] - previous[0]) * ratio, previous[1] + (current[1] - previous[1]) * ratio], brushRadiusPx, [minX, minY], cellSize);
		}
	}
	const tracedPolygon = traceLargestMaskBoundary(mask, [minX, minY], cellSize);
	const sampledPolygon = reduceByDistance(
		tracedPolygon,
		Math.max(simplifyTolerancePx * 2, cellSize * 2)
	);
	const reducedPolygon = simplifyClosed(sampledPolygon, Math.max(simplifyTolerancePx, 0));
	const polygon = softenCorners(reducedPolygon);
	let outline = polygon.map((point) => fromPixels(point, canvasSize));
	if (!outline.length) return [];
	outline.push([...outline[0]]);
	if (isValidBrushOutline(outline, canvasSize)) return outline;
	// Very tight concave paint regions can make even the lightweight reduction
	// self-intersect. In that rare case keep the raw traced boundary.
	outline = simplifyClosed(tracedPolygon, Math.max(simplifyTolerancePx, 0)).map((point) => fromPixels(point, canvasSize));
	if (!outline.length) return [];
	outline.push([...outline[0]]);
	if (isValidBrushOutline(outline, canvasSize)) return outline;
	// The trace itself is the lossless representation of the painted region;
	// it remains a final safe fallback if a particularly narrow mask defeats
	// both smoothing and simplification.
	outline = tracedPolygon.map((point) => fromPixels(point, canvasSize));
	if (!outline.length) return [];
	outline.push([...outline[0]]);
	return isValidBrushOutline(outline, canvasSize) ? outline : [];
}

/** Backward-compatible name used by the drawing tool. */
export const createBrushOutline = createBrushMaskOutline;
