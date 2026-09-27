import { formatPitchLabel, formatVariantLabel } from '@vorstieg/topo-renderer';
import type { Path2D, Point2D } from '$lib/assets/js/path-geometry.ts';
import {
	getOutlineMidpoints,
	getOutlinePoints,
	getPresetSemanticHandles
} from '$lib/assets/js/outline-geometry.ts';
import type { OutlineCanvasSize, OutlineRecord } from '$lib/assets/js/outline-geometry.ts';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.ts';
import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';

type EntityId = string | number;
type PathObject = { id: EntityId; points2D?: Path2D; curve?: unknown; [key: string]: unknown };
type RenderRoute = PathObject & {
	type?: string | string[];
	pitches?: PathObject[];
	variants?: PathObject[];
};
type RenderTopo = {
	routes: RenderRoute[];
	outlines: OutlineRecord[];
	fixPoints?: Array<{ id: EntityId; position2D?: Point2D }>;
	textLabels?: Array<{ id: EntityId; position2D?: Point2D }>;
};
type RenderPath = {
	routeId: EntityId;
	pitchId: EntityId | null;
	variantId: EntityId | null;
	points?: Path2D;
};
export type Topo2DRenderModelInput = {
	topo: RenderTopo;
	isSelected: (type: string, id: EntityId) => boolean;
	isRoutePointSelected?: (target: RoutePointTarget) => boolean;
	selectionSize: number;
	activeTool: string;
	drawingTarget: TopoDrawingTarget | null;
	isInteractionActive: boolean;
	baseWidth: number;
	baseHeight: number;
	currentRoutePoints: Path2D;
	currentOutlinePoints: Path2D;
	ui?: Record<string, unknown>;
};
export type RoutePointTarget = {
	routeId: EntityId;
	pitchId: EntityId | null;
	variantId: EntityId | null;
	index: number;
};
type SvgPathData = { points: Path2D; pointsStr: string };
type RouteRenderLine = SvgPathData & {
	id: EntityId;
	pitchId: EntityId | null;
	variantId: EntityId | null;
	isPitch: boolean;
	isVariant: boolean;
	lineSelected: boolean;
	label: string | number | null | undefined;
	routeObj: PathObject;
	parentRoute: RenderRoute;
	curve: unknown;
	index: number;
};
export type Topo2DRenderModel = {
	outlines: {
		items: OutlineRecord[];
		fills: OutlineRecord[];
		handles: Array<{
			outlineId: EntityId;
			index: number;
			point: Point2D;
			handleSize: number;
			hitSize: number;
		}>;
		midpoints: Array<{
			outlineId: EntityId;
			insertIndex: number;
			midX: number;
			midY: number;
			midpointSize: number;
			midpointHitSize: number;
		}>;
		semanticHandles: Array<{
			outlineId: EntityId;
			id: string;
			kind: string;
			point: Point2D;
			handleSize: number;
			hitSize: number;
		}>;
	};
	routes: RouteRenderLine[];
	routeLabels: RouteRenderLine[];
	routeMidpoints: Array<
		Omit<RoutePointTarget, 'index'> & {
			insertIndex: number;
			midX: number;
			midY: number;
			midpointSize: number;
			midpointHitSize: number;
		}
	>;
	routePointHandles: Array<
		RoutePointTarget & { point: Point2D; selected: boolean; handleSize: number; hitSize: number }
	>;
	currentRoute: SvgPathData[];
	currentOutline: SvgPathData[];
	currentOutlineFill: SvgPathData[];
};

function toSvgPoints(
	points: Path2D,
	{ baseWidth, baseHeight }: Required<Pick<OutlineCanvasSize, 'baseWidth' | 'baseHeight'>>
): string {
	return points.map((point) => `${point[0] * baseWidth},${point[1] * baseHeight}`).join(' ');
}

function isMultiPitch(route: RenderRoute): boolean {
	const type = Array.isArray(route.type) ? route.type : [route.type];
	return type.includes('multi-pitch');
}

function getRoutePaths(route: RenderRoute): RenderPath[] {
	if (!isMultiPitch(route))
		return [{ routeId: route.id, pitchId: null, variantId: null, points: route.points2D }];
	return [
		...(route.pitches || []).map((pitch) => ({
			routeId: route.id,
			pitchId: pitch.id,
			variantId: null,
			points: pitch.points2D
		})),
		...(route.variants || []).map((variant) => ({
			routeId: route.id,
			pitchId: null,
			variantId: variant.id,
			points: variant.points2D
		}))
	];
}

/**
 * Converts persistent topo data and ephemeral editor state into flat SVG data.
 * It deliberately contains no D3 or DOM calls, so renderer layers can remain
 * small and the difficult route/pitch/variant rules have one home.
 */
export function buildTopo2DRenderModel({
	topo,
	isSelected,
	isRoutePointSelected = () => false,
	selectionSize,
	activeTool,
	drawingTarget,
	isInteractionActive,
	baseWidth,
	baseHeight,
	currentRoutePoints,
	currentOutlinePoints
}: Topo2DRenderModelInput): Topo2DRenderModel {
	const canvasSize = { baseWidth, baseHeight };
	const canEditHandles =
		!isInteractionActive &&
		(activeTool === 'select' ||
			activeTool === 'routeEdit' ||
			activeTool === 'outlineEdit' ||
			activeTool === 'eraser');
	const outlineHandles: Topo2DRenderModel['outlines']['handles'] = [];
	const outlineMidpoints: Topo2DRenderModel['outlines']['midpoints'] = [];
	const outlineSemanticHandles: Topo2DRenderModel['outlines']['semanticHandles'] = [];
	topo.outlines.forEach((outline) => {
		if (!canEditHandles || selectionSize > 1 || !isSelected('outline', outline.id)) return;
		const handleSize = activeTool === 'eraser' ? 7 : 4;
		const hitSize = getTouchTargetSize(handleSize);
		getOutlinePoints(outline, canvasSize).forEach((point, index) => {
			outlineHandles.push({ outlineId: outline.id, index, point, handleSize, hitSize });
		});
		const midpointSize = 3;
		const midpointHitSize = getTouchTargetSize(3);
		getOutlineMidpoints(outline, canvasSize).forEach((midpoint) => {
			outlineMidpoints.push({
				outlineId: outline.id,
				insertIndex: midpoint.insertIndex,
				midX: midpoint.point[0],
				midY: midpoint.point[1],
				midpointSize,
				midpointHitSize
			});
		});
		getPresetSemanticHandles(outline, canvasSize).forEach((handle) => {
			outlineSemanticHandles.push({
				outlineId: outline.id,
				...handle,
				point: handle.point as Point2D,
				handleSize: 5,
				// Preset controls are intentionally close together (for example width,
				// height, and lean). Keep the click radius tight so neighboring controls
				// and outline vertices do not steal each other's pointer events.
				hitSize: 7
			});
		});
	});

	const routes: RouteRenderLine[] = [];
	const routeLabels: RouteRenderLine[] = [];
	const routeMidpoints: Topo2DRenderModel['routeMidpoints'] = [];
	topo.routes.forEach((route, index) => {
		const hasSelectedNestedPath =
			(route.pitches || []).some((pitch) => isSelected('pitch', pitch.id)) ||
			(route.variants || []).some((variant) => isSelected('variant', variant.id));
		const addRouteLine = ({
			points,
			label,
			pitchId = null,
			variantId = null,
			routeObject,
			labelOnly = false
		}: {
			points?: Path2D;
			label?: string | number | null;
			pitchId?: EntityId | null;
			variantId?: EntityId | null;
			routeObject: PathObject;
			labelOnly?: boolean;
		}) => {
			if (!points?.length) return;
			const nestedSelected =
				(pitchId != null && isSelected('pitch', pitchId)) ||
				(variantId != null && isSelected('variant', variantId));
			const selected =
				nestedSelected ||
				(!hasSelectedNestedPath && isSelected('route', route.id)) ||
				(drawingTarget?.type === 'newPitch' &&
					drawingTarget.routeId === route.id &&
					Boolean(pitchId)) ||
				(drawingTarget?.type === 'pitch' && drawingTarget.pitchId === pitchId) ||
				(drawingTarget?.type === 'variant' && drawingTarget.variantId === variantId);
			const line = {
				id: route.id,
				pitchId,
				variantId,
				isPitch: Boolean(pitchId),
				isVariant: Boolean(variantId),
				points,
				pointsStr: toSvgPoints(points, canvasSize),
				lineSelected: selected,
				label,
				routeObj: routeObject,
				parentRoute: route,
				curve: routeObject?.curve || route.curve,
				index
			};
			if (!labelOnly) routes.push(line);
			if (label) routeLabels.push(line);
		};

		if (isMultiPitch(route)) {
			route.pitches!.forEach((pitch, pitchIndex) =>
				addRouteLine({
					points: pitch.points2D,
					label: formatPitchLabel(pitch, pitchIndex),
					pitchId: pitch.id,
					routeObject: pitch
				})
			);
			if (route.pitches![0]?.points2D?.length) {
				addRouteLine({
					points: route.pitches![0].points2D,
					label: index + 1,
					routeObject: route,
					labelOnly: true
				});
			}
			(route.variants || []).forEach((variant, variantIndex) =>
				addRouteLine({
					points: variant.points2D,
					label: formatVariantLabel(variant, variantIndex),
					variantId: variant.id,
					routeObject: variant
				})
			);
		} else {
			addRouteLine({ points: route.points2D, label: index + 1, routeObject: route });
		}
	});

	const routePointHandles: Topo2DRenderModel['routePointHandles'] = [];
	const addPathControls = ({ routeId, pitchId, variantId, points }: RenderPath) => {
		points?.forEach((point, index) => {
			const target = { routeId, pitchId, variantId, index };
			routePointHandles.push({
				...target,
				point,
				selected: isRoutePointSelected(target),
				// Keep the visual control compact. Its larger hit area is rendered separately
				// so touch editing stays practical without obscuring the route.
				handleSize: activeTool === 'eraser' ? 5 : 3,
				hitSize: getTouchTargetSize(activeTool === 'eraser' ? 5 : 3)
			});
		});
		if (points && points.length > 1) {
			const midpointSize = 2;
			const midpointHitSize = getTouchTargetSize(2);
			for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
				const start = points[pointIndex];
				const end = points[pointIndex + 1];
				routeMidpoints.push({
					routeId,
					pitchId,
					variantId,
					insertIndex: pointIndex + 1,
					midX: (start[0] + end[0]) / 2,
					midY: (start[1] + end[1]) / 2,
					midpointSize,
					midpointHitSize
				});
			}
		}
	};
	const getDrawingTargetPath = () => {
		if (!drawingTarget) return null;
		const routeId = drawingTarget.routeId;
		const route = topo.routes.find((item) => String(item.id) === String(routeId));
		return (route ? getRoutePaths(route) : []).find(
			(path) =>
				(drawingTarget.type === 'route' && !path.pitchId && !path.variantId) ||
				(drawingTarget.type === 'pitch' &&
					String(path.pitchId) === String(drawingTarget.pitchId)) ||
				(drawingTarget.type === 'variant' &&
					String(path.variantId) === String(drawingTarget.variantId))
		);
	};
	if (canEditHandles) {
		const activePath = getDrawingTargetPath();
		const activeNestedPath =
			activePath && (drawingTarget?.type === 'pitch' || drawingTarget?.type === 'variant');
		const selectedPaths = topo.routes
			.filter((route) => isSelected('route', route.id))
			.flatMap(getRoutePaths)
			.filter((path) => !activeNestedPath || String(path.routeId) !== String(activePath.routeId));
		for (const path of [...selectedPaths, activePath].filter((item): item is RenderPath =>
			Boolean(item)
		))
			addPathControls(path);
	}

	return {
		outlines: {
			items: topo.outlines,
			fills: topo.outlines.filter(
				(outline) => outline.fillColor && getOutlinePoints(outline, canvasSize).length > 2
			),
			handles: outlineHandles,
			midpoints: outlineMidpoints,
			semanticHandles: outlineSemanticHandles
		},
		routes,
		routeLabels,
		routeMidpoints,
		routePointHandles,
		currentRoute: currentRoutePoints.length
			? [{ points: currentRoutePoints, pointsStr: toSvgPoints(currentRoutePoints, canvasSize) }]
			: [],
		currentOutline: currentOutlinePoints.length
			? [{ points: currentOutlinePoints, pointsStr: toSvgPoints(currentOutlinePoints, canvasSize) }]
			: [],
		currentOutlineFill:
			currentOutlinePoints.length > 2
				? [
						{
							points: currentOutlinePoints,
							pointsStr: toSvgPoints(currentOutlinePoints, canvasSize)
						}
					]
				: []
	};
}
