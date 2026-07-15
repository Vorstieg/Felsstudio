import { getOutlineLineStyle } from '@vorstieg/topo-renderer';
import { getOutlinePoints, pointsToSvg } from '$lib/assets/js/outline-geometry.js';
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
// 1.5 Rock Outlines Rendering
// Hit Area
const outlineSelection = outlinesLayer
	.selectAll('polyline.hit-area')
	.data(renderModel.outlines.items, (d) => d.id);

outlineSelection
	.join(
		(enter) =>
			enter
				.append('polyline')
				.attr('class', 'outline-hit-area hit-area cursor-pointer')
				.attr('fill', 'none')
				.attr('stroke', 'transparent')
				.on('mousedown', handleOutlineDown)
				.on('touchstart', handleOutlineTouch)
				.on('click', (e, d) => handleObjectClick(e, 'outline', d.id)),
		(update) => update,
		(exit) => exit.remove()
	)
	.attr('points', (d) =>
		pointsToSvg(getOutlinePoints(d, { baseWidth, baseHeight }), { baseWidth, baseHeight })
	)
	.attr('stroke-width', getHitAreaSize(8))
	.style('pointer-events', canInteract ? 'auto' : 'none');

// Main Path
const outlineMainSelection = outlinesLayer
	.selectAll('polyline.rock-outline')
		.data(outlines, (d) => d.id);

outlineMainSelection
	.join(
		(enter) =>
			enter.append('polyline').attr('class', 'cursor-move rock-outline').attr('fill', 'none'),
		(update) => update,
		(exit) => exit.remove()
	)
	.attr('points', (d) =>
		pointsToSvg(getOutlinePoints(d, { baseWidth, baseHeight }), { baseWidth, baseHeight })
	)
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
	.style('pointer-events', canInteract ? 'auto' : 'none');

// Filled shapes (for closed outlines with fill)
const outlineFillSelection = outlinesLayer
	.selectAll('polygon.outline-fill')
	.data(renderModel.outlines.fills, (d) => d.id);

outlineFillSelection
	.join(
		(enter) => enter.append('polygon').attr('class', 'outline-fill'),
		(update) => update,
		(exit) => exit.remove()
	)
	.attr('points', (d) =>
		pointsToSvg(getOutlinePoints(d, { baseWidth, baseHeight }), { baseWidth, baseHeight })
	)
	.attr('fill', (d) => d.fillColor || 'none')
	.attr('fill-opacity', (d) => d.fillOpacity || 0.3)
	.attr('stroke', 'none')
	.style('pointer-events', 'none');

	outlineEditTool?.render({ layers, renderModel, activeTool, baseWidth, baseHeight, canvasInput });

}
