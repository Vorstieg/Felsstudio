import { getRouteLineStyle } from '@vorstieg/topo-renderer';
import { pointsToSmoothSvgPath } from '$lib/assets/js/outline-geometry.js';
import { getHitAreaSize } from '$lib/assets/js/mobile-utils.js';

/** Renders persisted route paths and delegates their edit controls to RouteEditTool. */
export function renderRoutesLayer({
	layers,
	renderModel,
	activeTool,
	baseWidth,
	baseHeight,
	canvasInput,
	editTools,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}) {
	const routeEditTool = editTools?.route;
	const routePath = (route) =>
		route.curve?.enabled
			? pointsToSmoothSvgPath(route.points, {
					tension: route.curve.tension,
					baseWidth,
					baseHeight
				})
			: `M ${route.pointsStr.replaceAll(' ', ' L ')}`;
	const routesLayer = layers.routes;
	const canInteract =
		activeTool === 'select' || activeTool === 'eraser' || activeTool === routeEditTool?.id;
	const handleRouteDown = (event, route) => {
		const target = { id: route.id, pitchId: route.pitchId, variantId: route.variantId };
		if (['select', 'eraser', routeEditTool?.id].includes(activeTool)) {
			routeEditTool.handleRouteDown(event, target, canvasInput);
		} else {
			handleObjectMouseDown(event, { type: 'route', ...target });
		}
	};
	const handleRouteTouch = (event, route) => {
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
		.selectAll('g.route-container')
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
		.selectAll('path.hit-area')
		.data((route) => [route])
		.join('path')
		.attr('class', 'hit-area cursor-pointer')
		.attr('fill', 'none')
		.attr('stroke', 'transparent')
		.attr('d', routePath)
		.attr('stroke-width', getHitAreaSize(7))
		.style('pointer-events', canInteract ? 'auto' : 'none')
		.on('mousedown', handleRouteDown)
		.on('touchstart', handleRouteTouch)
		.on('click', (event, route) => {
			if (!route.isPitch && activeTool !== routeEditTool?.id)
				handleObjectClick(event, 'route', route.id);
		});

	routeGroups
		.selectAll('path.main-path')
		.data((route) => [route])
		.join('path')
		.attr('class', 'main-path cursor-move')
		.attr('fill', 'none')
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round')
		.attr('d', routePath)
		.attr('stroke', (route) =>
			route.lineSelected
				? '#3b82f6'
				: getRouteLineStyle(route.routeObj?.lineStyle || route.parentRoute?.lineStyle).stroke
		)
		.attr('stroke-width', (route) => {
			const style = getRouteLineStyle(route.routeObj?.lineStyle || route.parentRoute?.lineStyle);
			return route.lineSelected ? style.width + 2 : style.width;
		})
		.attr(
			'stroke-dasharray',
			(route) => getRouteLineStyle(route.routeObj?.lineStyle || route.parentRoute?.lineStyle).dash
		)
		// The transparent hit area is intentionally wider than the visual path.
		// Let it receive every route click, including clicks on the visible line.
		.style('pointer-events', 'none')
		.on('mousedown', handleRouteDown)
		.on('touchstart', handleRouteTouch)
		.on('click', (event, route) => {
			if (!route.isPitch && activeTool !== routeEditTool?.id)
				handleObjectClick(event, 'route', route.id);
		});

	routeEditTool?.render({
		layers,
		renderModel,
		activeTool,
		baseWidth,
		baseHeight,
		canvasInput
	});
}
