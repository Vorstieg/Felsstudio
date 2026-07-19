import { formatPitchLabel, formatVariantLabel } from '@vorstieg/topo-renderer';
import {
	getOutlineMidpoints,
	getOutlinePoints,
	getPresetSemanticHandles
} from '$lib/assets/js/outline-geometry.js';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';

function toSvgPoints(points, { baseWidth, baseHeight }) {
	return points.map((point) => `${point[0] * baseWidth},${point[1] * baseHeight}`).join(' ');
}

/**
 * Converts persistent topo data and ephemeral editor state into flat SVG data.
 * It deliberately contains no D3 or DOM calls, so renderer layers can remain
 * small and the difficult route/pitch/variant rules have one home.
 */
export function buildTopo2DRenderModel({
	topo,
	ui,
	isSelected,
	selectionSize,
	activeTool,
	drawingTarget,
	isInteractionActive,
	baseWidth,
	baseHeight,
	currentRoutePoints,
	currentOutlinePoints
}) {
	const canvasSize = { baseWidth, baseHeight };
	const canEditHandles =
		!isInteractionActive &&
		(activeTool === 'select' ||
			activeTool === 'routeEdit' ||
			activeTool === 'outlineEdit' ||
			activeTool === 'eraser');
	const singleSelection = canEditHandles && selectionSize <= 1 && ui.selectedRouteId !== null;

	const outlineHandles = [];
	const outlineMidpoints = [];
	const outlineSemanticHandles = [];
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
				handleSize: 5,
				hitSize: getTouchTargetSize(5)
			});
		});
	});

	const routes = [];
	const routeLabels = [];
	const routeMidpoints = [];
	topo.routes.forEach((route, index) => {
		const addRouteLine = ({
			points,
			id,
			label,
			pitchId = null,
			variantId = null,
			routeObject,
			labelOnly = false
		}) => {
			if (!points?.length) return;
			const selected =
				isSelected('route', route.id) ||
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
				index
			};
			if (!labelOnly) routes.push(line);
			if (label) routeLabels.push(line);

			if (!labelOnly && canEditHandles && selectionSize <= 1 && selected && points.length > 1) {
				const midpointSize = 2;
				const midpointHitSize = getTouchTargetSize(2);
				for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
					const start = points[pointIndex];
					const end = points[pointIndex + 1];
					routeMidpoints.push({
						routeId: route.id,
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

		if (route.type === 'multi-pitch' && route.pitches) {
			route.pitches.forEach((pitch, pitchIndex) =>
				addRouteLine({
					points: pitch.points2D,
					id: pitch.id,
					label: formatPitchLabel(pitch, pitchIndex),
					pitchId: pitch.id,
					routeObject: pitch
				})
			);
			if (route.pitches[0]?.points2D?.length) {
				addRouteLine({
					points: route.pitches[0].points2D,
					id: route.id,
					label: index + 1,
					routeObject: route,
					labelOnly: true
				});
			}
			(route.variants || []).forEach((variant, variantIndex) =>
				addRouteLine({
					points: variant.points2D,
					id: variant.id,
					label: formatVariantLabel(variant, variantIndex),
					variantId: variant.id,
					routeObject: variant
				})
			);
		} else {
			addRouteLine({ points: route.points2D, id: route.id, label: index + 1, routeObject: route });
		}
	});

	const routePointHandles = [];
	const addPointHandles = (routeId, pitchId, variantId, points) => {
		points?.forEach((point, index) => {
			routePointHandles.push({
				routeId,
				pitchId,
				variantId,
				index,
				point,
				// Keep the visual control compact. Its larger hit area is rendered separately
				// so touch editing stays practical without obscuring the route.
				handleSize: activeTool === 'eraser' ? 5 : 3,
				hitSize: getTouchTargetSize(activeTool === 'eraser' ? 5 : 3)
			});
		});
	};
	if (!isInteractionActive && singleSelection && ui.selectedRouteId) {
		const route = topo.routes.find((item) => item.id === ui.selectedRouteId);
		if (route?.points2D) addPointHandles(route.id, null, null, route.points2D);
	}
	if (
		(activeTool === 'select' ||
			activeTool === 'routeEdit' ||
			activeTool === 'eraser' ||
			activeTool === 'multipitch') &&
		drawingTarget
	) {
		const route = topo.routes.find((item) => item.id === drawingTarget.routeId);
		if (drawingTarget.type === 'pitch') {
			const pitch = route?.pitches?.find((item) => item.id === drawingTarget.pitchId);
			if (pitch?.points2D) addPointHandles(route.id, pitch.id, null, pitch.points2D);
		}
		if (drawingTarget.type === 'variant') {
			const variant = route?.variants?.find((item) => item.id === drawingTarget.variantId);
			if (variant?.points2D) addPointHandles(route.id, null, variant.id, variant.points2D);
		}
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
