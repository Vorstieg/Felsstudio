import type { Path2D, Point2D } from './path-geometry.ts';

export type OutlineCanvasSize = { baseWidth?: number; baseHeight?: number };
export type OutlinePresetId = 'slab' | 'pillar' | 'wall' | 'ramp' | 'arete' | 'corner' | 'roof';
export type OutlineSemantic = {
	version?: number;
	width?: number;
	height?: number;
	lean?: number;
	taper?: number;
	notchDepth?: number;
	[key: string]: number | undefined;
};
export type OutlineShape = {
	type: string;
	preset?: OutlinePresetId;
	semantic?: OutlineSemantic;
	points2D?: Path2D;
	start2D?: Point2D;
	end2D?: Point2D;
	center2D?: Point2D;
	radius2D?: number;
};
export type OutlineRecord = {
	id: string;
	lineStyle?: string;
	shape?: OutlineShape | null;
	points2D: Path2D;
	fillColor?: string | null;
	fillOpacity?: number;
	curve?: { enabled: boolean; tension: number };
	closed?: boolean;
};

export const OUTLINE_SHAPE_TYPES = {
	POLYLINE: 'polyline',
	RECTANGLE: 'rectangle',
	CIRCLE: 'circle',
	FREEHAND: 'freehand'
};

export const CIRCLE_SEGMENTS = 48;
export const FREEHAND_POINT_SPACING_PX = 4;
export const DEFAULT_FREEHAND_SMOOTHING_PX = 2;
export const DEFAULT_OUTLINE_CURVE_TENSION = 0.45;
export const PILLAR_OUTLINE_CURVE_TENSION = 0.3;

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
		// A slab is a simple parallelogram with horizontal top/bottom edges.
		points: [
			[0.16, 0.06],
			[0.92, 0.06],
			[0.76, 0.96],
			[0, 0.96],
			[0.16, 0.06]
		]
	},
	{
		id: 'pillar',
		labelKey: 'ui.outline_preset_pillar',
		icon: 'fa-building-columns',
		// A pillar continues beyond the lower edge of the topo, so leave its
		// base open rather than connecting the two bottom points.
		points: [
			[0.88, 1],
			[0.82, 0.68],
			[0.76, 0.34],
			[0.69, 0.02],
			[0.32, 0],
			[0.22, 0.35],
			[0.16, 0.7],
			[0.08, 1]
		]
	},
	{
		id: 'wall',
		labelKey: 'ui.outline_preset_wall',
		icon: 'fa-vector-square',
		points: [
			[0.04, 0.96],
			[0, 0.62],
			[0.06, 0.28],
			[0.18, 0.02],
			[0.86, 0],
			[0.98, 0.25],
			[1, 0.64],
			[0.93, 1],
			[0.04, 0.96]
		]
	},
	{
		id: 'ramp',
		labelKey: 'ui.outline_preset_ramp',
		icon: 'fa-arrow-trend-up',
		// A ramp reads as a right-angled triangular wedge.  The lower side is
		// horizontal but left open; the right angle sits on one lower corner and
		// moves to the other lower corner when the preset is mirrored.
		points: [
			[0, 1],
			[1, 0.24],
			[1, 1]
		]
	},
	{
		id: 'arete',
		labelKey: 'ui.outline_preset_arete',
		icon: 'fa-slash',
		// An arête reads better as an open ridge/edge than as a closed diamond.
		points: [
			[0.28, 1],
			[0.38, 0.74],
			[0.5, 0.5],
			[0.6, 0.25],
			[0.72, 0]
		]
	},
	{
		id: 'corner',
		labelKey: 'ui.outline_preset_corner',
		icon: 'fa-v',
		// Match the topo symbol more closely: two steep wall cheeks and a central
		// crease. The left cheek is explicitly closed so its lower-left edge is
		// visible, then the path continues across the right cheek.
		points: [
			[0.1, 0.06],
			[0.1, 0.82],
			[0.5, 0.98],
			[0.5, 0.2],
			[0.1, 0.06],
			[0.5, 0.2],
			[0.9, 0.06],
			[0.9, 0.82],
			[0.5, 0.98]
		]
	}
];

export const PRESET_SEMANTIC_VERSION = 1;

export function getOutlinePreset(presetId: string): (typeof OUTLINE_PRESETS)[number] | null {
	return OUTLINE_PRESETS.find((preset) => preset.id === presetId) || null;
}

/** Maps a unit-template to a drag gesture, preserving drag direction for mirrored formations. */
export function createPresetPoints(presetId: string, start2D: Point2D, end2D: Point2D): Path2D {
	const preset = getOutlinePreset(presetId);
	if (!preset || !start2D || !end2D) return [];
	const width = end2D[0] - start2D[0];
	const height = end2D[1] - start2D[1];
	return preset.points.map(([x, y]) => [start2D[0] + x * width, start2D[1] + y * height]);
}

export function createPresetShape(
	presetId: OutlinePresetId,
	start2D: Point2D,
	end2D: Point2D,
	{ semantic = {} }: { semantic?: OutlineSemantic } = {}
): OutlineShape | null {
	if (!getOutlinePreset(presetId)) return null;
	return {
		type: OUTLINE_SHAPE_TYPES.POLYLINE,
		preset: presetId,
		semantic: { version: PRESET_SEMANTIC_VERSION, ...semantic },
		points2D: createPresetPoints(presetId, start2D, end2D)
	};
}

export function isPresetShape(shape?: OutlineShape | null): boolean {
	return Boolean(
		shape?.type === OUTLINE_SHAPE_TYPES.POLYLINE && getOutlinePreset(shape.preset ?? '')
	);
}

export function isPresetOutline(outline?: OutlineRecord | null): boolean {
	return isPresetShape(outline?.shape);
}

/**
 * Handles are derived rather than serialized. They are intentionally generic
 * so the editor can add richer preset-specific interactions without changing
 * exported topo JSON.
 */
export function getPresetSemanticHandles(
	outline: OutlineRecord,
	canvasSize: OutlineCanvasSize = {}
): Array<{ id: string; kind: string; point: Point2D }> {
	if (!outline?.shape || !isPresetOutline(outline)) return [];
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
	const handles: Array<{ id: string; kind: string; point: Point2D }> = [
		{ id: 'width', kind: 'scale-width', point: [maxX, centerY] },
		{ id: 'height', kind: 'scale-height', point: [centerX, minY] }
	];
	if (['pillar', 'slab', 'wall', 'ramp', 'corner'].includes(outline.shape.preset ?? '')) {
		handles.push({ id: 'lean', kind: 'lean', point: [centerX, minY] });
	}
	if (['pillar', 'wall'].includes(outline.shape.preset ?? '')) {
		handles.push({ id: 'taper', kind: 'taper', point: [centerX, maxY] });
	}
	if (outline.shape.preset === 'roof') {
		handles.push({ id: 'notch', kind: 'notch-depth', point: [centerX, centerY] });
	}
	return handles;
}

function getPresetBounds(points: Path2D = []) {
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

function cloneOutline(outline: OutlineRecord): OutlineRecord {
	return JSON.parse(JSON.stringify(outline)) as OutlineRecord;
}

function getPresetNotchIndex(preset: string | undefined): number | null {
	if (preset === 'roof') return 6;
	return null;
}

function presetSupportsSemantic(
	preset: string,
	key: keyof Pick<OutlineSemantic, 'lean' | 'taper' | 'notchDepth'>
) {
	if (key === 'lean') return ['pillar', 'slab', 'wall', 'ramp', 'corner'].includes(preset);
	if (key === 'taper') return ['pillar', 'wall'].includes(preset);
	if (key === 'notchDepth') return preset === 'roof';
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
export function updatePresetOutline(
	outline: OutlineRecord,
	patch: Partial<OutlineSemantic> = {},
	canvasSize: OutlineCanvasSize = {}
): OutlineRecord {
	if (!outline.shape || !isPresetOutline(outline)) return outline;
	const updated = cloneOutline(outline);
	const updatedShape = updated.shape;
	if (!updatedShape) return outline;
	const points: Path2D = getOutlinePoints(updated, canvasSize).map((point) => [...point]);
	const initialBounds = getPresetBounds(points);
	if (!initialBounds) return outline;
	const semantic = { version: PRESET_SEMANTIC_VERSION, ...(updatedShape.semantic || {}) };

	if (typeof patch.width === 'number' && Number.isFinite(patch.width) && patch.width > 0) {
		const factor = patch.width / initialBounds.width;
		for (const point of points)
			point[0] = initialBounds.minX + (point[0] - initialBounds.minX) * factor;
		semantic.width = patch.width;
	}

	if (typeof patch.height === 'number' && Number.isFinite(patch.height) && patch.height > 0) {
		const factor = patch.height / initialBounds.height;
		for (const point of points)
			point[1] = initialBounds.maxY - (initialBounds.maxY - point[1]) * factor;
		semantic.height = patch.height;
	}

	const bounds = getPresetBounds(points);
	if (!bounds) return outline;
	const applyRelative = (
		key: 'lean' | 'taper' | 'notchDepth',
		apply: (
			difference: number,
			currentBounds: NonNullable<ReturnType<typeof getPresetBounds>>
		) => void
	) => {
		const value = patch[key];
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			!presetSupportsSemantic(updatedShape.preset ?? '', key)
		)
			return;
		const previous =
			typeof semantic[key] === 'number' && Number.isFinite(semantic[key]) ? semantic[key] : 0;
		apply(value - previous, bounds);
		semantic[key] = value;
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
		const notchIndex = getPresetNotchIndex(updatedShape.preset);
		if (notchIndex !== null && points[notchIndex]) {
			points[notchIndex][1] += difference * currentBounds.height;
		}
	});

	updatedShape.points2D = points;
	updatedShape.semantic = semantic;
	updated.points2D = points.map((point) => [...point]);
	updated.closed = isClosedShape(points);
	return updated;
}

/**
 * Pointer-oriented convenience wrapper for editor gizmos. The pointer is in
 * normalized canvas coordinates and is converted to the persisted semantic
 * value before delegating to updatePresetOutline().
 */
export function applyPresetSemanticHandle(
	outline: OutlineRecord,
	handleId: string,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): OutlineRecord {
	if (!outline.shape || !isPresetOutline(outline) || !Array.isArray(point)) return outline;
	const bounds = getPresetBounds(getOutlinePoints(outline, canvasSize));
	if (!bounds) return outline;
	let patch: Partial<OutlineSemantic>;
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

export function applyPresetSemanticHandleDrag(
	outline: OutlineRecord,
	handleId: string,
	startPoint: Point2D,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): OutlineRecord {
	if (
		!outline.shape ||
		!isPresetOutline(outline) ||
		!Array.isArray(startPoint) ||
		!Array.isArray(point)
	)
		return outline;
	const bounds = getPresetBounds(getOutlinePoints(outline, canvasSize));
	if (!bounds) return outline;
	const semantic = outline.shape.semantic || {};
	const dx = point[0] - startPoint[0];
	const dy = point[1] - startPoint[1];
	let patch: Partial<OutlineSemantic>;
	if (handleId === 'width') patch = { width: Math.max(bounds.width + dx, Number.EPSILON) };
	else if (handleId === 'height') patch = { height: Math.max(bounds.height - dy, Number.EPSILON) };
	else if (handleId === 'lean') patch = { lean: (Number(semantic.lean) || 0) + dx / bounds.width };
	else if (handleId === 'taper')
		patch = { taper: (Number(semantic.taper) || 0) + dx / (bounds.width / 2) };
	else if (handleId === 'notch')
		patch = { notchDepth: (Number(semantic.notchDepth) || 0) + dy / bounds.height };
	else return outline;
	return updatePresetOutline(outline, patch, canvasSize);
}

/** Drops editor-only preset information while retaining the exact visible path. */
export function convertPresetToPolyline(
	outline: OutlineRecord,
	canvasSize: OutlineCanvasSize = {}
): OutlineRecord {
	if (!outline.shape || !isPresetOutline(outline)) return outline;
	const points2D = getOutlinePoints(outline, canvasSize);
	outline.shape = { type: OUTLINE_SHAPE_TYPES.POLYLINE, points2D };
	outline.points2D = points2D;
	outline.closed = isClosedShape(points2D);
	return outline;
}

export function normalizeCanvasSize(canvasSize: OutlineCanvasSize = {}) {
	const { baseWidth = 1, baseHeight = 1 } = canvasSize || {};
	return {
		baseWidth: Math.max(baseWidth, 1),
		baseHeight: Math.max(baseHeight, 1)
	};
}

export function distancePx(a: Point2D, b: Point2D, canvasSize: OutlineCanvasSize = {}): number {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const dx = (a[0] - b[0]) * baseWidth;
	const dy = (a[1] - b[1]) * baseHeight;
	return Math.sqrt(dx * dx + dy * dy);
}

export function createRectanglePoints(
	start: Point2D,
	end: Point2D,
	{
		center = false,
		square = false,
		canvasSize
	}: { center?: boolean; square?: boolean; canvasSize?: OutlineCanvasSize } = {}
): Path2D {
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

export function createCirclePoints(
	center: Point2D,
	radius2D: number,
	canvasSize: OutlineCanvasSize = {},
	segments = CIRCLE_SEGMENTS
): Path2D {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const radiusY = radius2D * (baseWidth / baseHeight);
	const points: Path2D = [];

	for (let i = 0; i < segments; i++) {
		const angle = (i / segments) * Math.PI * 2;
		points.push([center[0] + radius2D * Math.cos(angle), center[1] + radiusY * Math.sin(angle)]);
	}

	points.push(points[0]);
	return points;
}

function perpendicularDistancePx(
	point: Point2D,
	lineStart: Point2D,
	lineEnd: Point2D,
	canvasSize: OutlineCanvasSize
): number {
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
	points: Path2D,
	tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX,
	canvasSize: OutlineCanvasSize = {}
): Path2D {
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

/**
 * Simplifies a closed outline without treating its duplicate final point as a
 * line endpoint. This is intentionally a conservative, local reduction: it
 * removes raster-like near-collinear vertices while retaining the contour's
 * closure and at least three vertices.
 */
export function simplifyClosedPoints(
	points: Path2D,
	tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX,
	canvasSize: OutlineCanvasSize = {}
): Path2D {
	if (!isClosedPath(points) || points.length <= 4 || tolerancePx <= 0) return points || [];

	const polygon = points.slice(0, -1);
	let simplified = polygon;
	// A second pass catches runs of very short, nearly straight brush vertices
	// exposed after the first pass, while remaining deliberately conservative.
	for (let pass = 0; pass < 2 && simplified.length > 3; pass += 1) {
		const next = simplified.filter((point, index, current) => {
			const previous = current[(index - 1 + current.length) % current.length];
			const following = current[(index + 1) % current.length];
			return perpendicularDistancePx(point, previous, following, canvasSize) > tolerancePx;
		});
		if (next.length < 3 || next.length === simplified.length) break;
		simplified = next;
	}

	return [...simplified, [...simplified[0]]];
}

export function isClosedShape(points: Path2D = []): boolean {
	return isClosedPath(points);
}

export function translateOutline(
	outline: OutlineRecord,
	deltaX: number,
	deltaY: number,
	canvasSize: OutlineCanvasSize = {}
): void {
	if (
		outline.shape?.type === OUTLINE_SHAPE_TYPES.RECTANGLE &&
		outline.shape.start2D &&
		outline.shape.end2D
	) {
		outline.shape.start2D = [outline.shape.start2D[0] + deltaX, outline.shape.start2D[1] + deltaY];
		outline.shape.end2D = [outline.shape.end2D[0] + deltaX, outline.shape.end2D[1] + deltaY];
	} else if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE && outline.shape.center2D) {
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

export function setOutlinePoint(
	outline: OutlineRecord,
	pointIndex: number,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): void {
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
		if (!center) return;
		outline.shape.radius2D =
			distancePx(center, point, canvasSize) / normalizeCanvasSize(canvasSize).baseWidth;
	} else if (outline.shape?.points2D) {
		outline.shape.points2D = points;
	}

	outline.points2D = getOutlinePoints(outline, canvasSize);
}

export function insertOutlinePoint(
	outline: OutlineRecord,
	insertIndex: number,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): void {
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

export function removeOutlinePoint(
	outline: OutlineRecord,
	pointIndex: number,
	canvasSize: OutlineCanvasSize = {}
): void {
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

export function getOutlineMidpoints(outline: OutlineRecord, canvasSize: OutlineCanvasSize = {}) {
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
	curve = { enabled: false, tension: DEFAULT_OUTLINE_CURVE_TENSION },
	canvasSize = {}
}: {
	id: string;
	lineStyle?: string;
	type?: string;
	points2D?: Path2D;
	shape?: OutlineShape | null;
	fillColor?: string | null;
	fillOpacity?: number;
	curve?: { enabled: boolean; tension: number };
	canvasSize?: OutlineCanvasSize;
}): OutlineRecord {
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
		curve: {
			enabled: Boolean(curve?.enabled),
			tension: Number.isFinite(Number(curve?.tension))
				? Math.min(1, Math.max(0, Number(curve.tension)))
				: DEFAULT_OUTLINE_CURVE_TENSION
		},
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
} from './path-geometry.ts';
import {
	getOutlinePoints as getSharedOutlinePoints,
	pointsToSmoothSvgPath as sharedPointsToSmoothSvgPath,
	pointsToSvg as sharedPointsToSvg
} from '@vorstieg/topo-renderer';

export const pointsToSvg = sharedPointsToSvg;
export const pointsToSmoothSvgPath = sharedPointsToSmoothSvgPath;
export const getOutlinePoints: (outline: OutlineRecord, canvasSize?: OutlineCanvasSize) => Path2D =
	getSharedOutlinePoints;
