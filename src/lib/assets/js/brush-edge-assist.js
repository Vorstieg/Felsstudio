/**
 * Image-edge assistance for the paint-area outline tool.
 *
 * This deliberately does not look at the whole photograph.  It only samples
 * candidate pixels which are inside the painted brush mask, and follows the
 * direction of the user's stroke.  It is therefore an assist for a deliberate
 * brush gesture, not automatic rock segmentation.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function canvasMetrics(canvasSize = {}) {
	return {
		width: Math.max(Number(canvasSize.baseWidth) || 1, 1),
		height: Math.max(Number(canvasSize.baseHeight) || 1, 1)
	};
}

function cleanStroke(strokePoints, canvasSize, minimumDistance = 0.5) {
	const { width, height } = canvasMetrics(canvasSize);
	const result = [];
	for (const point of strokePoints ?? []) {
		if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
		const pixel = [point[0] * width, point[1] * height];
		if (!result.length || distance(pixel, result.at(-1)) >= minimumDistance) result.push(pixel);
	}
	return result;
}

function interpolateStroke(stroke, spacing) {
	if (stroke.length < 2) return stroke;
	const result = [stroke[0]];
	for (let index = 1; index < stroke.length; index++) {
		const start = stroke[index - 1];
		const end = stroke[index];
		const steps = Math.max(1, Math.ceil(distance(start, end) / spacing));
		for (let step = 1; step <= steps; step++) {
			const ratio = step / steps;
			result.push([start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]);
		}
	}
	return result;
}

/** Creates a predicate for the union of the round dabs painted by a stroke. */
export function createBrushMaskPredicate(strokePoints, { brushRadiusPx = 18, canvasSize = {} } = {}) {
	const radius = Math.max(Number(brushRadiusPx) || 0, 0);
	const stroke = interpolateStroke(cleanStroke(strokePoints, canvasSize), Math.max(radius / 2, 1));
	return (normalizedPoint) => {
		if (!Array.isArray(normalizedPoint) || !stroke.length || radius <= 0) return false;
		const { width, height } = canvasMetrics(canvasSize);
		const pixel = [normalizedPoint[0] * width, normalizedPoint[1] * height];
		return stroke.some((center) => distance(pixel, center) <= radius);
	};
}

function pixelLuma(imageData, x, y) {
	const safeX = clamp(Math.round(x), 0, imageData.width - 1);
	const safeY = clamp(Math.round(y), 0, imageData.height - 1);
	const offset = (safeY * imageData.width + safeX) * 4;
	const data = imageData.data;
	return (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
}

function sobel(imageData, x, y) {
	const topLeft = pixelLuma(imageData, x - 1, y - 1);
	const top = pixelLuma(imageData, x, y - 1);
	const topRight = pixelLuma(imageData, x + 1, y - 1);
	const left = pixelLuma(imageData, x - 1, y);
	const right = pixelLuma(imageData, x + 1, y);
	const bottomLeft = pixelLuma(imageData, x - 1, y + 1);
	const bottom = pixelLuma(imageData, x, y + 1);
	const bottomRight = pixelLuma(imageData, x + 1, y + 1);
	return {
		x: -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight,
		y: -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
	};
}

function pointInImageMask(point, imageData, contains) {
	if (point[0] < 1 || point[1] < 1 || point[0] >= imageData.width - 1 || point[1] >= imageData.height - 1) return false;
	return !contains || contains([point[0] / imageData.width, point[1] / imageData.height]);
}

function candidatesAt(anchor, tangent, radius, step, imageData, contains) {
	const normal = [-tangent[1], tangent[0]];
	const candidates = [];
	for (let offset = -radius; offset <= radius + 0.01; offset += step) {
		const point = [anchor[0] + normal[0] * offset, anchor[1] + normal[1] * offset];
		if (!pointInImageMask(point, imageData, contains)) continue;
		const gradient = sobel(imageData, point[0], point[1]);
		const magnitude = Math.hypot(gradient.x, gradient.y);
		// A photographed boundary has a gradient perpendicular to its line. This
		// reduces attraction to cracks which run along the painted stroke.
		const directional = magnitude > 1e-6
			? Math.abs((gradient.x * normal[0] + gradient.y * normal[1]) / magnitude)
			: 0;
		candidates.push({ point, offset, score: Math.min(magnitude / 2.5, 1) * (0.35 + 0.65 * directional) });
	}
	return candidates;
}

/**
 * Finds an edge-aligned open path inside a painted brush mask.
 *
 * `maskContains` receives normalized coordinates.  When omitted, the mask is
 * reconstructed from the round brush dabs. The returned points are normalized
 * to the image and intentionally remain open; callers decide whether to turn
 * the tracked centreline into an outline or retain their mask outline.
 */
export function findBrushImageEdge(
	imageData,
	strokePoints,
	{
		canvasSize = {},
		brushRadiusPx = 18,
		maskContains,
		sampleSpacingPx = 5,
		candidateSpacingPx = 2,
		minimumConfidence = 0.32
	} = {}
) {
	if (!imageData?.data || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) return null;
	const canvas = canvasMetrics(canvasSize);
	const stroke = cleanStroke(strokePoints, canvasSize);
	if (stroke.length < 2) return null;
	const scaleX = imageData.width / canvas.width;
	const scaleY = imageData.height / canvas.height;
	const imageStroke = interpolateStroke(stroke.map(([x, y]) => [x * scaleX, y * scaleY]), Math.max(sampleSpacingPx, 2));
	if (imageStroke.length < 2) return null;
	const radius = Math.max(brushRadiusPx * (scaleX + scaleY) / 2, candidateSpacingPx);
	const contains = maskContains ?? createBrushMaskPredicate(strokePoints, { brushRadiusPx, canvasSize });
	const layers = imageStroke.map((anchor, index) => {
		const before = imageStroke[Math.max(0, index - 1)];
		const after = imageStroke[Math.min(imageStroke.length - 1, index + 1)];
		const length = Math.max(distance(before, after), 1e-6);
		return candidatesAt(anchor, [(after[0] - before[0]) / length, (after[1] - before[1]) / length], radius, Math.max(candidateSpacingPx, 1), imageData, contains);
	});
	if (layers.some((layer) => !layer.length)) return null;

	// Viterbi-style dynamic programming rewards a strong edge but penalizes
	// jumps, yielding one continuous path instead of noisy independent snaps.
	layers[0].forEach((candidate) => { candidate.total = candidate.score; candidate.previous = -1; });
	for (let layerIndex = 1; layerIndex < layers.length; layerIndex++) {
		const previous = layers[layerIndex - 1];
		for (const candidate of layers[layerIndex]) {
			let best = -Infinity;
			let bestIndex = -1;
			for (let index = 0; index < previous.length; index++) {
				const prior = previous[index];
				const penalty = Math.min(Math.abs(candidate.offset - prior.offset) / Math.max(radius, 1), 1) * 0.55;
				if (prior.total - penalty > best) { best = prior.total - penalty; bestIndex = index; }
			}
			candidate.total = candidate.score + best;
			candidate.previous = bestIndex;
		}
	}
	let index = layers.at(-1).reduce((best, candidate, candidateIndex, layer) => candidate.total > layer[best].total ? candidateIndex : best, 0);
	const path = [];
	const scores = [];
	for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex--) {
		const candidate = layers[layerIndex][index];
		path.push([candidate.point[0] / imageData.width, candidate.point[1] / imageData.height]);
		scores.push(candidate.score);
		index = candidate.previous;
	}
	path.reverse();
	const confidence = scores.reduce((sum, score) => sum + score, 0) / scores.length;
	return confidence >= minimumConfidence ? { points: path, confidence } : null;
}
