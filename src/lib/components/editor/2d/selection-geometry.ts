import { getOutlinePoints } from '$lib/assets/js/outline-geometry.ts';
import type { OutlineCanvasSize, OutlineDraft } from '$lib/assets/js/outline-geometry.ts';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';

type EntityId = string | number;
type SelectionPath = { id?: EntityId; points2D?: Point2D[] };
type SelectionRoute = SelectionPath & {
	id: EntityId;
	pitches?: SelectionPath[];
	variants?: SelectionPath[];
};
type SelectionTopo = {
	routes: SelectionRoute[];
	outlines: OutlineDraft[];
	fixPoints?: Array<{ id: EntityId; position2D?: Point2D }>;
	textLabels?: Array<{ id: EntityId; position2D?: Point2D }>;
};

export type SelectionPoint = { x: number; y: number };
export type SelectionRegion = {
	start: SelectionPoint;
	end: SelectionPoint;
	left: number;
	right: number;
	top: number;
	bottom: number;
	containsOnly: boolean;
};
export type SelectionItem = { type: 'route' | 'outline' | 'symbol' | 'text'; id: EntityId };
export type RoutePointSelection = {
	routeId: EntityId;
	pitchId: EntityId | null;
	variantId: EntityId | null;
	index: number;
};

export function createSelectionRegion(start: SelectionPoint, end: SelectionPoint): SelectionRegion {
	return {
		start,
		end,
		left: Math.min(start.x, end.x),
		right: Math.max(start.x, end.x),
		top: Math.min(start.y, end.y),
		bottom: Math.max(start.y, end.y),
		containsOnly: end.x >= start.x
	};
}

const isInside = (point: Point2D, region: SelectionRegion) =>
	point[0] >= region.left &&
	point[0] <= region.right &&
	point[1] >= region.top &&
	point[1] <= region.bottom;

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
	const cross = (p: Point2D, q: Point2D, r: Point2D) =>
		(q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	const abC = cross(a, b, c);
	const abD = cross(a, b, d);
	const cdA = cross(c, d, a);
	const cdB = cross(c, d, b);
	return abC * abD <= 0 && cdA * cdB <= 0;
}

function touchesRegion(points: Point2D[], region: SelectionRegion) {
	if (points.some((point) => isInside(point, region))) return true;
	const corners: Point2D[] = [
		[region.left, region.top],
		[region.right, region.top],
		[region.right, region.bottom],
		[region.left, region.bottom]
	];
	return points.some((point, index) => {
		if (!index) return false;
		return corners.some((corner, cornerIndex) =>
			segmentsIntersect(
				point,
				points[index - 1],
				corner,
				corners[(cornerIndex + 1) % corners.length]
			)
		);
	});
}

function matchesPath(points: Point2D[] | undefined, region: SelectionRegion) {
	if (!points?.length) return false;
	return region.containsOnly
		? points.every((point) => isInside(point, region))
		: touchesRegion(points, region);
}

export function getRegionSelection(
	topo: SelectionTopo,
	region: SelectionRegion,
	canvasSize: OutlineCanvasSize
): SelectionItem[] {
	const selected: SelectionItem[] = [];
	const add = (type: SelectionItem['type'], id: EntityId) => selected.push({ type, id });

	topo.routes.forEach((route) => {
		const paths = [
			route.points2D,
			...(route.pitches || []).map((pitch) => pitch.points2D),
			...(route.variants || []).map((variant) => variant.points2D)
		];
		if (paths.some((points) => matchesPath(points, region))) add('route', route.id);
	});
	topo.outlines.forEach((outline) => {
		if (matchesPath(getOutlinePoints(outline, canvasSize), region)) add('outline', outline.id);
	});
	(topo.fixPoints || []).forEach((symbol) => {
		if (symbol.position2D && isInside(symbol.position2D, region)) add('symbol', symbol.id);
	});
	(topo.textLabels || []).forEach((label) => {
		if (label.position2D && isInside(label.position2D, region)) add('text', label.id);
	});
	return selected;
}

export function getRoutePointRegionSelection(
	topo: SelectionTopo,
	routeId: EntityId,
	region: SelectionRegion,
	drawingTarget: TopoDrawingTarget | null = null
): RoutePointSelection[] {
	const route = (topo.routes || []).find((item) => String(item.id) === String(routeId));
	if (!route) return [];

	let paths: Array<{ points?: Point2D[]; pitchId?: EntityId; variantId?: EntityId }> = [];
	if (drawingTarget?.routeId != null && String(drawingTarget.routeId) === String(route.id)) {
		if (drawingTarget.type === 'pitch') {
			const pitch = (route.pitches || []).find(
				(item) => String(item.id) === String(drawingTarget.pitchId)
			);
			if (pitch) paths = [{ points: pitch.points2D, pitchId: pitch.id }];
		} else if (drawingTarget.type === 'variant') {
			const variant = (route.variants || []).find(
				(item) => String(item.id) === String(drawingTarget.variantId)
			);
			if (variant) paths = [{ points: variant.points2D, variantId: variant.id }];
		}
	}
	if (!paths.length && route.points2D) paths = [{ points: route.points2D }];

	return paths.flatMap(({ points = [], pitchId = null, variantId = null }) =>
		points.flatMap((point, index) =>
			isInside(point, region) ? [{ routeId: route.id, pitchId, variantId, index }] : []
		)
	);
}
