import { getOutlineLineStyle } from '@vorstieg/topo-renderer';
import {
	getOutlinePoints,
	isClosedShape,
	pointsToSmoothSvgPath,
	pointsToSvg
} from '$lib/assets/js/outline-geometry.js';
import { getHitAreaSize } from '$lib/assets/js/mobile-utils.js';

/** Renders persisted outlines and their editable vertices. */
export function renderOutlinesLayer({
	layers,
	topo,
	renderModel,
	activeTool,
	baseWidth,
	baseHeight,
	canvasInput,
	outlineEditTool,
	isSelected,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}) {
	const outlinesLayer = layers.outlines;
	const outlines = topo.outlines;
	const canInteract =
		activeTool === 'select' || activeTool === 'eraser' || activeTool === outlineEditTool?.id;
	const handleOutlineDown = (event, outline) => {
		if (activeTool === 'select' || activeTool === outlineEditTool?.id) {
			outlineEditTool?.handleOutlineDown(event, outline, canvasInput);
		} else {
			handleObjectMouseDown(event, { type: 'outline', id: outline.id });
		}
	};
	const handleOutlineTouch = (event, outline) => {
		if (activeTool === 'select' || activeTool === outlineEditTool?.id) {
			outlineEditTool?.handleTouchOutlineDown(event, outline, canvasInput);
		} else if (event.touches.length === 1) {
			event.preventDefault();
			event.stopPropagation();
			canvasInput.trackTouch(event.touches[0]);
			handleObjectMouseDown(event.touches[0], { type: 'outline', id: outline.id });
		}
	};
	const getOutlinePath = (outline) => {
		const points = getOutlinePoints(outline, { baseWidth, baseHeight });
		const closed = isClosedShape(points);
		const curvedPath = outline.curve?.enabled
			? pointsToSmoothSvgPath(points, {
					closed,
					tension: outline.curve.tension,
					baseWidth,
					baseHeight
				})
			: null;
		if (curvedPath) return curvedPath;
		const straightPoints = pointsToSvg(points, { baseWidth, baseHeight });
		return straightPoints
			? `M ${straightPoints.replaceAll(' ', ' L ')}${closed ? ' Z' : ''}`
			: null;
	};
	// 1.5 Rock Outlines Rendering
	// Hit Area
	const outlineSelection = outlinesLayer
		.selectAll('path.outline-hit-area')
		.data(renderModel.outlines.items, (d) => d.id);

	outlineSelection
		.join(
			(enter) =>
				enter
					.append('path')
					.attr('class', 'outline-hit-area hit-area cursor-pointer')
					.attr('fill', 'none')
					.attr('stroke', 'transparent')
					.on('mousedown', handleOutlineDown)
					.on('touchstart', handleOutlineTouch)
					.on('click', (e, d) => handleObjectClick(e, 'outline', d.id)),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('d', getOutlinePath)
		.attr('data-testid', (outline) => `topo-object-outline-${outline.id}`)
		.attr('stroke-width', getHitAreaSize(8))
		.style('pointer-events', canInteract ? 'auto' : 'none');

	// Main Path
	const outlineMainSelection = outlinesLayer
		.selectAll('path.rock-outline')
		.data(outlines, (d) => d.id);

	outlineMainSelection
		.join(
			(enter) =>
				enter.append('path').attr('class', 'cursor-move rock-outline').attr('fill', 'none'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('d', getOutlinePath)
		.attr('data-testid', (outline) => `topo-object-outline-${outline.id}`)
		.attr('stroke', (d) =>
			isSelected('outline', d.id) ? '#3b82f6' : getOutlineLineStyle(d.lineStyle).stroke
		)
		.attr('stroke-width', (d) => {
			const style = getOutlineLineStyle(d.lineStyle);
			return isSelected('outline', d.id) ? style.width + 1 : style.width;
		})
		.attr('stroke-dasharray', (d) => getOutlineLineStyle(d.lineStyle).dash)
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round')
		// Keep the visible stroke out of hit testing so clicks directly on the
		// outline reach the wider hit area rendered immediately below it.
		.style('pointer-events', 'none');

	// Filled shapes (for closed outlines with fill)
	const outlineFillSelection = outlinesLayer
		.selectAll('path.outline-fill')
		.data(renderModel.outlines.fills, (d) => d.id);

	outlineFillSelection
		.join(
			(enter) => enter.append('path').attr('class', 'outline-fill'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('d', getOutlinePath)
		.attr('fill', (d) => d.fillColor || 'none')
		.attr('fill-opacity', (d) => d.fillOpacity || 0.3)
		.attr('stroke', 'none')
		.style('pointer-events', 'none');

	outlineEditTool?.render({ layers, renderModel, activeTool, baseWidth, baseHeight, canvasInput });
}
