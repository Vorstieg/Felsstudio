import type { Outline, Point2D } from '@vorstieg/fels-types/types';
import {
	closePath,
	isClosedPath,
	isLinePath,
	movePathVertex,
	translatePath
} from './path-geometry.ts';
import { getOutlinePoints as getSharedOutlinePoints } from '@vorstieg/topo-renderer';
export { pointsToSvg, pointsToSmoothSvgPath } from '@vorstieg/topo-renderer';

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
export type OutlineShape = NonNullable<Outline['shape']>;
/** Editor drafts can contain fewer than the document path's two required points. */
export type OutlineDraft = {
	[K in keyof Outline]: K extends 'points2D' ? Point2D[] : Outline[K];
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
 * A preset remains a polyline on disk. `preset` and `semantic` preserve its
 * origin while the rendered vertices live in the outline's top-level points2D.
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

/** Maps a unit-template to a drag gesture, preserving drag direction for mirrored formations. */
export function createPresetPoints(presetId: string, start2D: Point2D, end2D: Point2D): Point2D[] {
	const preset = OUTLINE_PRESETS.find((preset) => preset.id === presetId);
	if (!preset) return [];
	const width = end2D[0] - start2D[0];
	const height = end2D[1] - start2D[1];
	return preset.points.map(([x, y]): Point2D => [start2D[0] + x * width, start2D[1] + y * height]);
}

export function createPresetShape(
	presetId: OutlinePresetId,
	start2D: Point2D,
	end2D: Point2D,
	{ semantic = {} }: { semantic?: OutlineSemantic } = {}
): (OutlineShape & { points2D: Point2D[] }) | null {
	const points2D = createPresetPoints(presetId, start2D, end2D);
	if (!points2D.length) return null;
	return {
		type: OUTLINE_SHAPE_TYPES.POLYLINE,
		preset: presetId,
		semantic: { version: PRESET_SEMANTIC_VERSION, ...semantic },
		points2D
	};
}

export function isPresetOutline(
	outline: OutlineDraft | null | undefined
): outline is OutlineDraft & { shape: OutlineShape } {
	return (
		outline?.shape?.type === OUTLINE_SHAPE_TYPES.POLYLINE &&
		OUTLINE_PRESETS.some((preset) => preset.id === outline.shape?.preset)
	);
}

/**
 * Handles are derived rather than serialized. They are intentionally generic
 * so the editor can add richer preset-specific interactions without changing
 * exported topo JSON.
 */
export function getPresetSemanticHandles(
	outline: OutlineDraft,
	canvasSize: OutlineCanvasSize = {}
): Array<{ id: string; kind: string; point: Point2D }> {
	if (!isPresetOutline(outline)) return [];
	const points = getOutlinePoints(outline, canvasSize);
	if (!points.length) return [];
	const { maxX, minY, maxY, centerX, centerY } = getPresetBounds(points);
	const handles: Array<{ id: string; kind: string; point: Point2D }> = [
		{ id: 'width', kind: 'scale-width', point: [maxX, centerY] },
		{ id: 'height', kind: 'scale-height', point: [centerX, minY] }
	];
	if (PRESET_SEMANTICS.lean.includes(outline.shape.preset ?? '')) {
		handles.push({ id: 'lean', kind: 'lean', point: [centerX, minY] });
	}
	if (PRESET_SEMANTICS.taper.includes(outline.shape.preset ?? '')) {
		handles.push({ id: 'taper', kind: 'taper', point: [centerX, maxY] });
	}
	if (PRESET_SEMANTICS.notchDepth.includes(outline.shape.preset ?? '')) {
		handles.push({ id: 'notch', kind: 'notch-depth', point: [centerX, centerY] });
	}
	return handles;
}

function getPresetBounds(points: Point2D[]) {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const [x, y] of points) {
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
	}
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

const PRESET_SEMANTICS = {
	lean: ['pillar', 'slab', 'wall', 'ramp', 'corner'],
	taper: ['pillar', 'wall'],
	notchDepth: ['roof']
};

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
	outline: OutlineDraft,
	patch: Partial<OutlineSemantic> = {},
	canvasSize: OutlineCanvasSize = {}
): OutlineDraft {
	if (!isPresetOutline(outline)) return outline;
	const shape = outline.shape;
	const points = getOutlinePoints(outline, canvasSize).map((point): Point2D => [...point]);
	if (!points.length) return outline;
	const initialBounds = getPresetBounds(points);
	const semantic: OutlineSemantic = { version: PRESET_SEMANTIC_VERSION, ...shape.semantic };

	if (patch.width !== undefined && Number.isFinite(patch.width) && patch.width > 0) {
		const factor = patch.width / initialBounds.width;
		for (const point of points)
			point[0] = initialBounds.minX + (point[0] - initialBounds.minX) * factor;
		semantic.width = patch.width;
	}

	if (patch.height !== undefined && Number.isFinite(patch.height) && patch.height > 0) {
		const factor = patch.height / initialBounds.height;
		for (const point of points)
			point[1] = initialBounds.maxY - (initialBounds.maxY - point[1]) * factor;
		semantic.height = patch.height;
	}

	const bounds = getPresetBounds(points);
	for (const key of ['lean', 'taper', 'notchDepth'] as const) {
		const value = patch[key];
		if (
			value === undefined ||
			!Number.isFinite(value) ||
			!PRESET_SEMANTICS[key].includes(shape.preset ?? '')
		)
			continue;
		const difference = value - (semantic[key] ?? 0);
		for (const [index, point] of points.entries()) {
			const fromTop = (bounds.maxY - point[1]) / bounds.height;
			if (key === 'lean') point[0] += difference * bounds.width * fromTop;
			else if (key === 'taper')
				point[0] = bounds.centerX + (point[0] - bounds.centerX) * (1 + difference * fromTop);
			else if (index === 6) point[1] += difference * bounds.height;
		}
		semantic[key] = value;
	}
	return {
		...outline,
		shape: { ...shape, semantic },
		points2D: points,
		closed: isClosedPath(points)
	};
}

/**
 * Pointer-oriented convenience wrapper for editor gizmos. The pointer is in
 * normalized canvas coordinates and is converted to the persisted semantic
 * value before delegating to updatePresetOutline().
 */
export function applyPresetSemanticHandle(
	outline: OutlineDraft,
	handleId: string,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): OutlineDraft {
	if (!isPresetOutline(outline)) return outline;
	const points = getOutlinePoints(outline, canvasSize);
	if (!points.length) return outline;
	const bounds = getPresetBounds(points);
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
	outline: OutlineDraft,
	handleId: string,
	startPoint: Point2D,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): OutlineDraft {
	if (!isPresetOutline(outline)) return outline;
	const points = getOutlinePoints(outline, canvasSize);
	if (!points.length) return outline;
	const bounds = getPresetBounds(points);
	const semantic: OutlineSemantic = outline.shape.semantic || {};
	const dx = point[0] - startPoint[0];
	const dy = point[1] - startPoint[1];
	let patch: Partial<OutlineSemantic>;
	if (handleId === 'width') patch = { width: Math.max(bounds.width + dx, Number.EPSILON) };
	else if (handleId === 'height') patch = { height: Math.max(bounds.height - dy, Number.EPSILON) };
	else if (handleId === 'lean') patch = { lean: (semantic.lean ?? 0) + dx / bounds.width };
	else if (handleId === 'taper') patch = { taper: (semantic.taper ?? 0) + dx / (bounds.width / 2) };
	else if (handleId === 'notch')
		patch = { notchDepth: (semantic.notchDepth ?? 0) + dy / bounds.height };
	else return outline;
	return updatePresetOutline(outline, patch, canvasSize);
}

/** Drops editor-only preset information while retaining the exact visible path. */
export function convertPresetToPolyline(
	outline: OutlineDraft,
	canvasSize: OutlineCanvasSize = {}
): OutlineDraft {
	if (!isPresetOutline(outline)) return outline;
	const points2D = getOutlinePoints(outline, canvasSize);
	outline.shape = { type: OUTLINE_SHAPE_TYPES.POLYLINE };
	outline.points2D = points2D;
	outline.closed = isClosedPath(points2D);
	return outline;
}

export function normalizeCanvasSize(canvasSize: OutlineCanvasSize = {}) {
	const { baseWidth = 1, baseHeight = 1 } = canvasSize;
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
): Point2D[] {
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
): Point2D[] {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	const radiusY = radius2D * (baseWidth / baseHeight);
	const points: Point2D[] = [];

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
	points: Point2D[],
	tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX,
	canvasSize: OutlineCanvasSize = {}
): Point2D[] {
	if (points.length <= 2 || tolerancePx <= 0) return points;

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
	points: Point2D[],
	tolerancePx = DEFAULT_FREEHAND_SMOOTHING_PX,
	canvasSize: OutlineCanvasSize = {}
): Point2D[] {
	if (!isClosedPath(points) || points.length <= 4 || tolerancePx <= 0) return points;

	let simplified = points.slice(0, -1);
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

	return closePath(simplified);
}

export function translateOutline(
	outline: OutlineDraft,
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
	} else {
		outline.points2D = translatePath(getOutlinePoints(outline, canvasSize), [deltaX, deltaY]);
	}

	outline.points2D = getOutlinePoints(outline, canvasSize);
}

export function editOutlinePath(
	outline: OutlineDraft,
	edit: (points: Point2D[]) => Point2D[],
	canvasSize: OutlineCanvasSize = {}
): void {
	const points2D = edit(getOutlinePoints(outline, canvasSize));
	outline.shape = { type: OUTLINE_SHAPE_TYPES.POLYLINE };
	outline.points2D = points2D;
	outline.closed = isClosedPath(points2D);
}

export function setOutlinePoint(
	outline: OutlineDraft,
	pointIndex: number,
	point: Point2D,
	canvasSize: OutlineCanvasSize = {}
): void {
	const points = getOutlinePoints(outline, canvasSize);
	if (!points[pointIndex]) return;
	if (outline.shape?.type === OUTLINE_SHAPE_TYPES.CIRCLE) {
		const center = outline.shape.center2D;
		if (!center) return;
		outline.shape.radius2D =
			distancePx(center, point, canvasSize) / normalizeCanvasSize(canvasSize).baseWidth;
		outline.points2D = getOutlinePoints(outline, canvasSize);
	} else {
		outline.shape = { type: OUTLINE_SHAPE_TYPES.POLYLINE };
		outline.points2D = movePathVertex(points, pointIndex, point);
	}
	outline.closed = isClosedPath(outline.points2D);
}

export function createOutline({
	id,
	lineStyle = 'rock',
	type = OUTLINE_SHAPE_TYPES.POLYLINE,
	points2D = [],
	shape = null,
	fillColor = null,
	fillOpacity = 0.3,
	curve = { enabled: false, tension: DEFAULT_OUTLINE_CURVE_TENSION },
	canvasSize = {}
}: Partial<OutlineDraft> &
	Pick<Outline, 'id'> & {
		type?: string;
		canvasSize?: OutlineCanvasSize;
	}): OutlineDraft {
	const semanticShape =
		(shape ? { ...shape } : null) ||
		(type === OUTLINE_SHAPE_TYPES.CIRCLE || type === OUTLINE_SHAPE_TYPES.RECTANGLE
			? null
			: { type });
	const initialPoints = points2D;
	// Preview shapes carry vertices for the drawing UI; persisted shapes do not.
	if (semanticShape && 'points2D' in semanticShape) delete semanticShape.points2D;
	const outline: OutlineDraft = {
		id,
		lineStyle,
		shape: semanticShape,
		points2D: initialPoints,
		fillColor,
		fillOpacity,
		curve: {
			enabled: curve.enabled ?? false,
			tension: Number.isFinite(curve.tension ?? DEFAULT_OUTLINE_CURVE_TENSION)
				? Math.min(1, Math.max(0, curve.tension ?? DEFAULT_OUTLINE_CURVE_TENSION))
				: DEFAULT_OUTLINE_CURVE_TENSION
		}
	};

	outline.points2D = getOutlinePoints(outline, canvasSize);
	outline.closed = isClosedPath(outline.points2D);
	return outline;
}

export function prepareOutlinesForExport(
	outlines: OutlineDraft[] = [],
	canvasSize: OutlineCanvasSize = {}
): Outline[] {
	return outlines.map((outline) => {
		const points2D = getOutlinePoints(outline, canvasSize);
		return {
			...outline,
			points2D: isLinePath(points2D) ? points2D : undefined,
			closed: isClosedPath(points2D)
		};
	});
}

export function getOutlinePoints(outline: OutlineDraft, canvasSize?: OutlineCanvasSize): Point2D[] {
	if (outline.shape?.type !== 'rectangle' && outline.shape?.type !== 'circle')
		return outline.points2D ?? [];
	return getSharedOutlinePoints({ id: outline.id, shape: outline.shape }, canvasSize);
}
