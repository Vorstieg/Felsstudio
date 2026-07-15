import { getOutlineLineStyle } from '@vorstieg/topo-renderer';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';

/** Renders in-progress route and outline previews. */
export function renderCurrentLayer({
	layers,
	renderModel,
	currentOutlinePoints,
	selectedOutlineStyle,
	outlinePreview
}) {
	const layer = layers.current;
	const outlineStyle = getOutlineLineStyle(selectedOutlineStyle);
	layer
		.selectAll('polyline.current-outline')
		.data(renderModel.currentOutline)
		.join(
			(enter) =>
				enter
					.append('polyline')
					.attr('class', 'current-outline')
					.attr('fill', 'none')
					.attr('stroke-linecap', 'round')
					.attr('stroke-linejoin', 'round'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('points', (item) => item.pointsStr)
		.attr('stroke', outlineStyle.stroke)
		.attr('stroke-width', outlineStyle.width)
		.attr('stroke-dasharray', outlineStyle.dash);

	layer
		.selectAll('circle.current-outline-point')
		.data(currentOutlinePoints)
		.join(
			(enter) => enter.append('circle').attr('class', 'current-outline-point').attr('fill', '#f59e0b'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('r', getTouchTargetSize(3))
		.attr('cx', (point) => point[0] * outlinePreview.baseWidth)
		.attr('cy', (point) => point[1] * outlinePreview.baseHeight);

	layer
		.selectAll('polygon.current-outline-fill')
		.data(renderModel.currentOutlineFill)
		.join(
			(enter) => enter.append('polygon').attr('class', 'current-outline-fill'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('points', (item) => item.pointsStr)
		.attr('fill', outlinePreview.fillColor || 'rgba(255, 165, 0, 0.2)')
		.attr('fill-opacity', outlinePreview.fillOpacity || 0.2)
		.attr('stroke', 'none');
}
