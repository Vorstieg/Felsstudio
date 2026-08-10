/** Renders editable route vertices and delegates pointer behavior to the editor. */
export function renderRouteHandlesLayer({
	layers,
	renderModel,
	activeTool,
	baseWidth,
	baseHeight,
	onPointMouseDown,
	setActiveTouch
}) {
	const layer = layers.handles;
	const handles = renderModel.routePointHandles;
	const onPointDown = (event, point) =>
		onPointMouseDown(event, {
			routeId: point.routeId,
			pitchId: point.pitchId,
			variantId: point.variantId,
			pointIndex: point.index
		});
	const selection = layer
		.selectAll('circle.route-point-handle')
		.data(
			handles,
			(item) => `handle-${item.routeId}-${item.pitchId || item.variantId || 'main'}-${item.index}`
		);

	selection
		.join(
			(enter) =>
				enter
					.append('circle')
					.attr('class', 'route-point-handle cursor-move')
					.attr('stroke-width', 2)
					.on('mousedown', (event, item) => onPointDown(event, item))
					.on('click', (event) => event?.stopPropagation?.())
					.on('touchstart', (event, item) => {
						if (event.touches.length !== 1) return;
						event.preventDefault();
						event.stopPropagation();
						setActiveTouch(event.touches[0].identifier);
						onPointDown(event.touches[0], item);
					}),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('cx', (item) => item.point[0] * baseWidth)
		.attr('cy', (item) => item.point[1] * baseHeight)
		.attr('r', (item) => item.handleSize)
		.attr('fill', activeTool === 'eraser' ? '#fee2e2' : 'white')
		.attr('stroke', activeTool === 'eraser' ? '#ef4444' : '#3b82f6')
		.attr(
			'class',
			() => `route-point-handle ${activeTool === 'select' ? 'cursor-move' : 'cursor-pointer'}`
		);
}
