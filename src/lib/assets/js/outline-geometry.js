export const OUTLINE_SHAPE_TYPES = {
	POLYLINE: 'polyline',
	RECTANGLE: 'rectangle',
	CIRCLE: 'circle',
	FREEHAND: 'freehand'
};

export const CIRCLE_SEGMENTS = 48;
export const FREEHAND_POINT_SPACING_PX = 4;
export const DEFAULT_FREEHAND_SMOOTHING_PX = 2;

export function normalizeCanvasSize(canvasSize = {}) {
	const { baseWidth = 1, baseHeight = 1 } = canvasSize || {};
	return {
		baseWidth: Math.max(baseWidth, 1),
		baseHeight: Math.max(baseHeight, 1)
	};
}

export function distancePx(a, b, canvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const dx = (a[0] - b[0]) * baseWidth;
	const dy = (a[1] - b[1]) * baseHeight;
	return Math.sqrt(dx * dx + dy * dy);
}

export function createRectanglePoints(start, end, { center = false, square = false, canvasSize } = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	let minX;
	let maxX;
	let minY;
	let maxY;

	if (center) {
		let dx = end[0] - start[0];
		let dy = end[1] - start[1];
		if (square) {
			const size = Math.max(Math.abs(dx) * baseWidth, Math.abs(dy) * baseHeight);
			dx = Math.sign(dx || 1) * (size / baseWidth);
			dy = Math.sign(dy || 1) * (size / baseHeight);
		}
		minX = start[0] - dx;
		maxX = start[0] + dx;
		minY = start[1] - dy;
		maxY = start[1] + dy;
	} else {
		let nextEnd = end;
		if (square) {
			const dx = end[0] - start[0];
			const dy = end[1] - start[1];
			const size = Math.max(Math.abs(dx) * baseWidth, Math.abs(dy) * baseHeight);
			nextEnd = [
				start[0] + Math.sign(dx || 1) * (size / baseWidth),
				start[1] + Math.sign(dy || 1) * (size / baseHeight)
			];
		}
		minX = Math.min(start[0], nextEnd[0]);
		maxX = Math.max(start[0], nextEnd[0]);
		minY = Math.min(start[1], nextEnd[1]);
		maxY = Math.max(start[1], nextEnd[1]);
	}

	return [
		[minX, minY],
		[maxX, minY],
		[maxX, maxY],
		[minX, maxY],
		[minX, minY]
	];
}

export function createCirclePoints(center, radius2D, canvasSize = {}, segments = CIRCLE_SEGMENTS) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const radiusY = radius2D * (baseWidth / baseHeight);
	const points = [];

	for (let i = 0; i < segments; i++) {
		const angle = (i / segments) * Math.PI * 2;
		points.push([
			center[0] + radius2D * Math.cos(angle),
			center[1] + radiusY * Math.sin(angle)
		]);
	}

	points.push(points[0]);
	return points;
}

export function createCirclePointsFromEdge(center, edge, canvasSize = {}) {
	const { baseWidth } = normalizeCanvasSize(canvasSize);
	const radius2D = distancePx(edge, center, canvasSize) / baseWidth;
	return createCirclePoints(center, radius2D, canvasSize);
}

function perpendicularDistancePx(point, lineStart, lineEnd, canvasSize) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const x = point[0] * baseWidth;
	const y = point[1] * baseHeight;
	const x1 = lineStart[0] * baseWidth;
	const y1 = lineStart[1] * baseHeight;
	const x2 = lineEnd[0] * baseWidth;
	const y2 = lineEnd[1] * baseHeight;
	const dx = x2 - x1;
	const dy = y2 - y1;

	if (dx === 0 && dy === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

	return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / Math.sqrt(dx * dx + dy * dy);
}

export function simplifyPoints(points, tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX, canvasSize = {}) {
	if (!points || points.length <= 2 || tolerancePx <= 0) return points || [];

	let maxDistance = 0;
	let index = 0;
	const endIndex = points.length - 1;

	for (let i = 1; i < endIndex; i++) {
		const distance = perpendicularDistancePx(points[i], points[0], points[endIndex], canvasSize);
		if (distance > maxDistance) {
			index = i;
			maxDistance = distance;
		}
	}

	if (maxDistance > tolerancePx) {
		const left = simplifyPoints(points.slice(0, index + 1), tolerancePx, canvasSize);
		const right = simplifyPoints(points.slice(index), tolerancePx, canvasSize);
		return [...left.slice(0, -1), ...right];
	}

	return [points[0], points[endIndex]];
}

export function isClosedShape(points = []) {
	return isClosedPath(points);
}

export function pointsToSvg(points = [], canvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return points.map((p) => `${p[0] * baseWidth},${p[1] * baseHeight}`).join(' ');
}

export function getOutlinePoints(outline, canvasSize = {}) {
	const shape = outline?.shape;
	if (!shape?.type) return outline?.points2D || [];

	if (shape.type === OUTLINE_SHAPE_TYPES.RECTANGLE) {
		return createRectanglePoints(shape.start2D, shape.end2D, {
			center: shape.fromCenter,
			square: shape.square,
			canvasSize
		});
	}

	if (shape.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		return createCirclePoints(shape.center2D, shape.radius2D, canvasSize, shape.segments || CIRCLE_SEGMENTS);
	}

	return shape.points2D || outline?.points2D || [];
}

export function translateOutline(outline, deltaX, deltaY, canvasSize = {}) {
	if (outline.shape?.type === OUTLINE_SHAPE_TYPES.RECTANGLE) {
		outline.shape.start2D = [outline.shape.start2D[0] + deltaX, outline.shape.start2D[1] + deltaY];
		outline.shape.end2D = [outline.shape.end2D[0] + deltaX, outline.shape.end2D[1] + deltaY];
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		outline.shape.center2D = [outline.shape.center2D[0] + deltaX, outline.shape.center2D[1] + deltaY];
	} else if (outline.shape?.points2D) {
		outline.shape.points2D = translatePath(outline.shape.points2D, [deltaX, deltaY]);
	} else if (outline.points2D) {
		outline.points2D = translatePath(outline.points2D, [deltaX, deltaY]);
	}

	outline.points2D = getOutlinePoints(outline, canvasSize);
}

export function setOutlinePoint(outline, pointIndex, point, canvasSize = {}) {
	const currentPoints = getOutlinePoints(outline, canvasSize);
	const points = movePathVertex(currentPoints, pointIndex, point, {
		closed: isClosedPath(currentPoints)
	});
	if (!points[pointIndex]) return;

	if (outline.shape?.type === OUTLINE_SHAPE_TYPES.RECTANGLE) {
		outline.shape = {
			type: OUTLINE_SHAPE_TYPES.POLYLINE,
			points2D: points
		};
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		const center = outline.shape.center2D;
		outline.shape.radius2D = distancePx(center, point, canvasSize) / normalizeCanvasSize(canvasSize).baseWidth;
	} else if (outline.shape?.points2D) {
		outline.shape.points2D = points;
	}

	outline.points2D = getOutlinePoints(outline, canvasSize);
}

export function insertOutlinePoint(outline, insertIndex, point, canvasSize = {}) {
	const currentPoints = getOutlinePoints(outline, canvasSize);
	const points = insertPathVertex(currentPoints, insertIndex, point, {
		closed: isClosedPath(currentPoints)
	});
	outline.shape = {
		type: OUTLINE_SHAPE_TYPES.POLYLINE,
		points2D: points
	};
	outline.points2D = points;
}

export function removeOutlinePoint(outline, pointIndex, canvasSize = {}) {
	const currentPoints = getOutlinePoints(outline, canvasSize);
	const points = removePathVertex(currentPoints, pointIndex, {
		closed: isClosedPath(currentPoints)
	});
	outline.shape = {
		type: OUTLINE_SHAPE_TYPES.POLYLINE,
		points2D: points
	};
	outline.points2D = points;
}

export function getOutlineMidpoints(outline, canvasSize = {}) {
	const points = getOutlinePoints(outline, canvasSize);
	return getPathMidpoints(points, { closed: isClosedPath(points) });
}

export function createOutlineRecord({
	id,
	lineStyle = 'rock',
	type = OUTLINE_SHAPE_TYPES.POLYLINE,
	points2D = [],
	shape = null,
	fillColor = null,
	fillOpacity = 0.3,
	canvasSize = {}
}) {
	const semanticShape =
		shape ||
		(type === OUTLINE_SHAPE_TYPES.CIRCLE || type === OUTLINE_SHAPE_TYPES.RECTANGLE
			? null
			: { type, points2D });
	const outline = {
		id,
		lineStyle,
		shape: semanticShape,
		points2D,
		fillColor,
		fillOpacity,
		closed: isClosedShape(points2D)
	};

	outline.points2D = getOutlinePoints(outline, canvasSize);
	outline.closed = isClosedShape(outline.points2D);
	return outline;
}

export function prepareOutlinesForExport(outlines = [], canvasSize = {}) {
	return outlines.map((outline) => {
		const exported = JSON.parse(JSON.stringify(outline));
		exported.points2D = getOutlinePoints(exported, canvasSize);
		exported.closed = isClosedShape(exported.points2D);
		return exported;
	});
}
import {
	getPathMidpoints,
	insertPathVertex,
	isClosedPath,
	movePathVertex,
	removePathVertex,
	translatePath
} from '$lib/assets/js/path-geometry.js';
