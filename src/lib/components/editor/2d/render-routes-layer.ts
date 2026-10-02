import { getRouteLineStyle } from '@vorstieg/topo-renderer';
import { pointsToSmoothSvgPath } from '$lib/assets/js/outline-geometry.ts';
import { getHitAreaSize, isTouchDevice } from '$lib/assets/js/mobile-utils.ts';
import type { Topo2DRenderModel } from './topo-2d-render-model.ts';
import type { TopoRenderContext } from './topo-render-context.ts';

type RouteLayerInput = Pick<
	TopoRenderContext,
	| 'layers'
	| 'renderModel'
	| 'activeTool'
	| 'baseWidth'
	| 'baseHeight'
	| 'canvasInput'
	| 'editTools'
	| 'hideControlPoints'
	| 'onObjectMouseDown'
	| 'onObjectClick'
>;
type RenderedRoute = Topo2DRenderModel['routes'][number];
type RouteEditRenderModel = Parameters<
	TopoRenderContext['editTools']['route']['render']
>[0]['renderModel'];

function getCurve(value: unknown): { enabled: boolean; tension: number } | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const curve = value as { enabled?: unknown; tension?: unknown };
	return typeof curve.enabled === 'boolean' && typeof curve.tension === 'number'
		? { enabled: curve.enabled, tension: curve.tension }
		: undefined;
}

/** Renders persisted route paths and delegates their edit controls to RouteEditTool. */
export function renderRoutesLayer({
	layers,
	renderModel,
	activeTool,
	baseWidth,
	baseHeight,
	canvasInput,
	editTools,
	hideControlPoints,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}: RouteLayerInput): void {
	const routeEditTool = editTools?.route;
	const routePath = (route: RenderedRoute) => {
		const curve = getCurve(route.curve);
		return curve?.enabled
			? pointsToSmoothSvgPath(route.points, {
					tension: curve.tension,
					baseWidth,
					baseHeight
				})
			: `M ${route.pointsStr.replaceAll(' ', ' L ')}`;
	};
	const routeHitAreaSize = (route: RenderedRoute) =>
		isTouchDevice() && (route.isPitch || route.isVariant) ? 10 : getHitAreaSize(7);
	const routeLineStyle = (route: RenderedRoute) => {
		const lineStyle = route.routeObj?.lineStyle ?? route.parentRoute?.lineStyle;
		return getRouteLineStyle(typeof lineStyle === 'string' ? lineStyle : undefined);
	};
	const routesLayer = layers.routes;
	const canInteract =
		activeTool === 'select' || activeTool === 'eraser' || activeTool === routeEditTool?.id;
	const handleRouteDown = (event: MouseEvent, route: RenderedRoute) => {
		const target = { id: route.id, pitchId: route.pitchId, variantId: route.variantId };
		if (['select', 'eraser', routeEditTool?.id].includes(activeTool)) {
			routeEditTool.handleRouteDown(event, target, canvasInput);
		} else {
			handleObjectMouseDown(event, { type: 'route', ...target });
		}
	};
	const handleRouteTouch = (event: TouchEvent, route: RenderedRoute) => {
		if (event.touches.length !== 1) return;
		const target = { id: route.id, pitchId: route.pitchId, variantId: route.variantId };
		if (['select', 'eraser', routeEditTool?.id].includes(activeTool)) {
			routeEditTool.handleTouchRouteDown(event, target, canvasInput);
		} else {
			event.preventDefault();
			event.stopPropagation();
			canvasInput.trackTouch(event.touches[0]);
			handleObjectMouseDown(event.touches[0], { type: 'route', ...target });
		}
	};

	const routeGroups = routesLayer
		.selectAll<SVGGElement, RenderedRoute>('g.route-container')
		.data(
			renderModel.routes,
			(route) => `route-${route.id}-${route.pitchId || route.variantId || 'main'}`
		)
		.join('g')
		.attr(
			'class',
			(route) =>
				`route-container ${route.isPitch ? 'pitch-group' : route.isVariant ? 'variant-group' : 'route-group'}`
		)
		.attr(
			'data-testid',
			(route) => `topo-object-route-${route.id}-${route.pitchId || route.variantId || 'main'}`
		)
		.style('touch-action', 'none');

	routeGroups
		.selectAll<SVGPathElement, RenderedRoute>('path.hit-area')
		.data((route) => [route])
		.join('path')
		.attr('class', 'hit-area cursor-pointer')
		.attr('fill', 'none')
		.attr('stroke', 'transparent')
		.attr('d', routePath)
		.attr('stroke-width', routeHitAreaSize)
		.style('pointer-events', canInteract ? 'auto' : 'none')
		.on('mousedown', handleRouteDown)
		.on('touchstart', handleRouteTouch)
		.on('click', (event, route) => {
			if (!route.isPitch && activeTool !== routeEditTool?.id)
				handleObjectClick(event, 'route', route.id);
		});

	routeGroups
		.selectAll<SVGPathElement, RenderedRoute>('path.main-path')
		.data((route) => [route])
		.join('path')
		.attr('class', 'main-path cursor-move')
		.attr('fill', 'none')
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round')
		.attr('d', routePath)
		.attr('stroke', (route) => (route.lineSelected ? '#3b82f6' : routeLineStyle(route).stroke))
		.attr('stroke-width', (route) => {
			const style = routeLineStyle(route);
			return route.lineSelected ? style.width + 2 : style.width;
		})
		.attr('stroke-dasharray', (route) => routeLineStyle(route).dash)
		// The transparent hit area is intentionally wider than the visual path.
		// Let it receive every route click, including clicks on the visible line.
		.style('pointer-events', 'none')
		.on('mousedown', handleRouteDown)
		.on('touchstart', handleRouteTouch)
		.on('click', (event, route) => {
			if (!route.isPitch && activeTool !== routeEditTool?.id)
				handleObjectClick(event, 'route', route.id);
		});

	const routeEditRenderModel: RouteEditRenderModel = {
		routeLabels: renderModel.routeLabels.map((route) => {
			const labelOffset2D = getLabelOffset(route.routeObj.labelOffset2D);
			return {
				id: route.id,
				pitchId: route.pitchId,
				variantId: route.variantId,
				points: route.points,
				routeObj: labelOffset2D ? { labelOffset2D } : undefined,
				lineSelected: route.lineSelected,
				label: String(route.label ?? '')
			};
		}),
		routePointHandles: renderModel.routePointHandles,
		routeMidpoints: renderModel.routeMidpoints
	};
	routeEditTool?.render({
		layers,
		renderModel: routeEditRenderModel,
		activeTool,
		baseWidth,
		baseHeight,
		canvasInput,
		hideControlPoints
	});
}

function getLabelOffset(value: unknown): [number, number] | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const [x, y] = value;
	return typeof x === 'number' && typeof y === 'number' ? [x, y] : undefined;
}
