export const OUTLINE_SHAPE_TYPES = {
	POLYLINE: 'polyline',
	RECTANGLE: 'rectangle',
	CIRCLE: 'circle',
	FREEHAND: 'freehand'
};

export const CIRCLE_SEGMENTS = 48;
export const FREEHAND_POINT_SPACING_PX = 4;
export const DEFAULT_FREEHAND_SMOOTHING_PX = 2;

/**
 * A preset deliberately remains a polyline on disk.  `preset` and `semantic`
 * preserve its origin for the editor, while every existing renderer can still
 * render `shape.points2D` without knowing about presets.
 */
export const OUTLINE_PRESETS = [
	{
		id: 'slab',
		labelKey: 'ui.outline_preset_slab',
		icon: 'fa-mountain',
		points: [
			[0.08, 0.05],
			[0.9, 0],
			[1, 0.92],
			[0.02, 1],
			[0.08, 0.05]
		]
	},
	{
		id: 'pillar',
		labelKey: 'ui.outline_preset_pillar',
		icon: 'fa-building-columns',
		points: [
			[0.28, 0],
			[0.75, 0.04],
			[0.92, 1],
			[0.12, 1],
			[0.28, 0]
		]
	},
	{
		id: 'arete',
		labelKey: 'ui.outline_preset_arete',
		icon: 'fa-diamond',
		points: [
			[0.5, 0],
			[1, 0.55],
			[0.48, 1],
			[0, 0.58],
			[0.5, 0]
		]
	},
	{
		id: 'overhang',
		labelKey: 'ui.outline_preset_overhang',
		icon: 'fa-arrow-down-wide-short',
		points: [
			[0, 0.08],
			[1, 0],
			[0.92, 0.42],
			[0.65, 0.43],
			[0.56, 0.72],
			[0.2, 1],
			[0, 0.08]
		]
	},
	{
		id: 'boulder',
		labelKey: 'ui.outline_preset_boulder',
		icon: 'fa-circle',
		points: [
			[0.22, 0.08],
			[0.62, 0],
			[0.9, 0.2],
			[1, 0.62],
			[0.76, 0.94],
			[0.31, 1],
			[0.03, 0.72],
			[0, 0.31],
			[0.22, 0.08]
		]
	},
	{
		id: 'cave',
		labelKey: 'ui.outline_preset_cave',
		icon: 'fa-door-open',
		points: [
			[0.05, 1],
			[0, 0.23],
			[0.24, 0],
			[0.76, 0],
			[1, 0.23],
			[0.95, 1],
			[0.68, 0.7],
			[0.5, 0.5],
			[0.32, 0.7],
			[0.05, 1]
		]
	},
	{
		id: 'ledge',
		labelKey: 'ui.outline_preset_ledge',
		icon: 'fa-grip-lines',
		points: [
			[0, 0.25],
			[0.72, 0],
			[1, 0.22],
			[0.78, 0.48],
			[0.95, 0.72],
			[0.28, 1],
			[0, 0.78],
			[0, 0.25]
		]
	}
];

export const PRESET_SEMANTIC_VERSION = 1;

export function getOutlinePreset(presetId) {
	return OUTLINE_PRESETS.find((preset) => preset.id === presetId) || null;
}

/** Maps a closed unit-template to the bounds of a drag gesture. */
export function createPresetPoints(presetId, start2D, end2D) {
	const preset = getOutlinePreset(presetId);
	if (!preset || !start2D || !end2D) return [];
	const minX = Math.min(start2D[0], end2D[0]);
	const maxX = Math.max(start2D[0], end2D[0]);
	const minY = Math.min(start2D[1], end2D[1]);
	const maxY = Math.max(start2D[1], end2D[1]);
	const width = maxX - minX;
	const height = maxY - minY;
	return preset.points.map(([x, y]) => [minX + x * width, minY + y * height]);
}

export function createPresetShape(presetId, start2D, end2D, { semantic = {} } = {}) {
	if (!getOutlinePreset(presetId)) return null;
	return {
		type: OUTLINE_SHAPE_TYPES.POLYLINE,
		preset: presetId,
		semantic: { version: PRESET_SEMANTIC_VERSION, ...semantic },
		points2D: createPresetPoints(presetId, start2D, end2D)
	};
}

export function isPresetShape(shape) {
	return Boolean(shape?.type === OUTLINE_SHAPE_TYPES.POLYLINE && getOutlinePreset(shape.preset));
}

export function isPresetOutline(outline) {
	return isPresetShape(outline?.shape);
}

/**
 * Handles are derived rather than serialized. They are intentionally generic
 * so the editor can add richer preset-specific interactions without changing
 * exported topo JSON.
 */
export function getPresetSemanticHandles(outline, canvasSize = {}) {
	if (!isPresetOutline(outline)) return [];
	const points = getOutlinePoints(outline, canvasSize);
	if (!points.length) return [];
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;
	const handles = [
		{ id: 'width', kind: 'scale-width', point: [maxX, centerY] },
		{ id: 'height', kind: 'scale-height', point: [centerX, minY] }
	];
	if (['pillar', 'slab'].includes(outline.shape.preset)) {
		handles.push({ id: 'lean', kind: 'lean', point: [centerX, minY] });
	}
	if (outline.shape.preset === 'pillar') {
		handles.push({ id: 'taper', kind: 'taper', point: [centerX, maxY] });
	}
	if (['overhang', 'cave'].includes(outline.shape.preset)) {
		handles.push({ id: 'notch', kind: 'notch-depth', point: [centerX, centerY] });
	}
	return handles;
}

function getPresetBounds(points = []) {
	if (!points.length) return null;
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	return {
		minX,
		maxX,
		minY,
		maxY,
		width: Math.max(maxX - minX, Number.EPSILON),
		height: Math.max(maxY - minY, Number.EPSILON),
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2
	};
}

function cloneOutline(outline) {
	return JSON.parse(JSON.stringify(outline));
}

function getPresetNotchIndex(preset) {
	if (preset === 'overhang') return 4;
	if (preset === 'cave') return 7;
	return null;
}

function presetSupportsSemantic(preset, key) {
	if (key === 'lean') return ['pillar', 'slab'].includes(preset);
	if (key === 'taper') return preset === 'pillar';
	if (key === 'notchDepth') return ['overhang', 'cave'].includes(preset);
	return true;
}

/**
 * Applies normalized semantic values to a preset without changing its storage
 * format. Width and height are canvas-normalized extents; lean, taper, and
 * notchDepth are dimensionless values relative to the current extent.
 *
 * The function is pure: callers must replace their outline record with the
 * returned value. Unknown properties, ordinary polylines, and unsupported
 * parameters are left untouched.
 */
export function updatePresetOutline(outline, patch = {}, canvasSize = {}) {
	if (!isPresetOutline(outline)) return outline;
	const updated = cloneOutline(outline);
	const points = getOutlinePoints(updated, canvasSize).map((point) => [...point]);
	const initialBounds = getPresetBounds(points);
	if (!initialBounds) return outline;
	const semantic = { version: PRESET_SEMANTIC_VERSION, ...(updated.shape.semantic || {}) };

	if (Number.isFinite(patch.width) && patch.width > 0) {
		const factor = patch.width / initialBounds.width;
		for (const point of points)
			point[0] = initialBounds.minX + (point[0] - initialBounds.minX) * factor;
		semantic.width = patch.width;
	}

	if (Number.isFinite(patch.height) && patch.height > 0) {
		const factor = patch.height / initialBounds.height;
		for (const point of points)
			point[1] = initialBounds.maxY - (initialBounds.maxY - point[1]) * factor;
		semantic.height = patch.height;
	}

	const bounds = getPresetBounds(points);
	const applyRelative = (key, apply) => {
		if (!Number.isFinite(patch[key]) || !presetSupportsSemantic(updated.shape.preset, key)) return;
		const previous = Number.isFinite(semantic[key]) ? semantic[key] : 0;
		apply(patch[key] - previous, bounds);
		semantic[key] = patch[key];
	};

	applyRelative('lean', (difference, currentBounds) => {
		for (const point of points) {
			const fromTop = (currentBounds.maxY - point[1]) / currentBounds.height;
			point[0] += difference * currentBounds.width * fromTop;
		}
	});

	applyRelative('taper', (difference, currentBounds) => {
		for (const point of points) {
			const fromTop = (currentBounds.maxY - point[1]) / currentBounds.height;
			point[0] =
				currentBounds.centerX + (point[0] - currentBounds.centerX) * (1 + difference * fromTop);
		}
	});

	applyRelative('notchDepth', (difference, currentBounds) => {
		const notchIndex = getPresetNotchIndex(updated.shape.preset);
		if (notchIndex !== null && points[notchIndex]) {
			points[notchIndex][1] += difference * currentBounds.height;
		}
	});

	// Preserve the SVG polyline invariant even if an external caller supplied
	// a malformed open path.
	if (points.length > 2) points[points.length - 1] = [...points[0]];
	updated.shape.points2D = points;
	updated.shape.semantic = semantic;
	updated.points2D = points.map((point) => [...point]);
	updated.closed = isClosedShape(points);
	return updated;
}

/**
 * Pointer-oriented convenience wrapper for editor gizmos. The pointer is in
 * normalized canvas coordinates and is converted to the persisted semantic
 * value before delegating to updatePresetOutline().
 */
export function applyPresetSemanticHandle(outline, handleId, point, canvasSize = {}) {
	if (!isPresetOutline(outline) || !Array.isArray(point)) return outline;
	const bounds = getPresetBounds(getOutlinePoints(outline, canvasSize));
	if (!bounds) return outline;
	let patch;
	if (handleId === 'width') patch = { width: Math.max(point[0] - bounds.minX, Number.EPSILON) };
	else if (handleId === 'height')
		patch = { height: Math.max(bounds.maxY - point[1], Number.EPSILON) };
	else if (handleId === 'lean') patch = { lean: (point[0] - bounds.centerX) / bounds.width };
	else if (handleId === 'taper')
		patch = { taper: (point[0] - bounds.centerX) / (bounds.width / 2) };
	else if (handleId === 'notch')
		patch = { notchDepth: (point[1] - bounds.centerY) / bounds.height };
	else return outline;
	return updatePresetOutline(outline, patch, canvasSize);
}

/** Drops editor-only preset information while retaining the exact visible path. */
export function convertPresetToPolyline(outline, canvasSize = {}) {
	if (!isPresetOutline(outline)) return outline;
	const points2D = getOutlinePoints(outline, canvasSize);
	outline.shape = { type: OUTLINE_SHAPE_TYPES.POLYLINE, points2D };
	outline.points2D = points2D;
	outline.closed = isClosedShape(points2D);
	return outline;
}

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

export function createRectanglePoints(
	start,
	end,
	{ center = false, square = false, canvasSize } = {}
) {
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
		points.push([center[0] + radius2D * Math.cos(angle), center[1] + radiusY * Math.sin(angle)]);
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

export function simplifyPoints(
	points,
	tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX,
	canvasSize = {}
) {
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

export function translateOutline(outline, deltaX, deltaY, canvasSize = {}) {
	if (outline.shape?.type === OUTLINE_SHAPE_TYPES.RECTANGLE) {
		outline.shape.start2D = [outline.shape.start2D[0] + deltaX, outline.shape.start2D[1] + deltaY];
		outline.shape.end2D = [outline.shape.end2D[0] + deltaX, outline.shape.end2D[1] + deltaY];
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		outline.shape.center2D = [
			outline.shape.center2D[0] + deltaX,
			outline.shape.center2D[1] + deltaY
		];
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

	if (isPresetOutline(outline)) {
		// A direct vertex edit deliberately makes the resulting path fully manual.
		outline.shape = {
			type: OUTLINE_SHAPE_TYPES.POLYLINE,
			points2D: points
		};
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.RECTANGLE) {
		outline.shape = {
			type: OUTLINE_SHAPE_TYPES.POLYLINE,
			points2D: points
		};
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		const center = outline.shape.center2D;
		outline.shape.radius2D =
			distancePx(center, point, canvasSize) / normalizeCanvasSize(canvasSize).baseWidth;
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
} from './path-geometry.js';
import {
	getOutlinePoints as getSharedOutlinePoints,
	pointsToSvg as sharedPointsToSvg
} from '@vorstieg/topo-renderer';

export const pointsToSvg = sharedPointsToSvg;
export const getOutlinePoints = getSharedOutlinePoints;
