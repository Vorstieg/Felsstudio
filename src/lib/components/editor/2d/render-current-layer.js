import { getOutlineLineStyle } from '@vorstieg/topo-renderer';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';

/** Renders in-progress route and outline previews. */
export function renderCurrentLayer({
	layers,
	renderModel,
	currentOutlinePoints,
	selectedOutlineStyle,
	outlinePreview,
	brushPreview = null
}) {
	const layer = layers.current;
	const outlineStyle = getOutlineLineStyle(selectedOutlineStyle);
	const brushPoints = brushPreview?.points || [];
	const brushContourPoints = brushPreview?.contourPoints || [];
	const toSvgPoints = (points) =>
		points
			.map((point) => `${point[0] * outlinePreview.baseWidth},${point[1] * outlinePreview.baseHeight}`)
			.join(' ');

	// A brush preview intentionally lives in the current layer rather than the
	// background image. It stays above the photo while painting but below the
	// editable controls. `points` is the raw brush centreline; `contourPoints`
	// is the simplified candidate that will become an ordinary outline after
	// the user accepts it.
	layer
		.selectAll('polyline.current-brush-stroke')
		.data(brushPoints.length ? [brushPoints] : [])
		.join(
			(enter) =>
				enter
					.append('polyline')
					.attr('class', 'current-brush-stroke')
					.attr('fill', 'none')
					.attr('stroke-linecap', 'round')
					.attr('stroke-linejoin', 'round'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('points', toSvgPoints)
		.attr('stroke', brushPreview?.stroke || 'rgba(59, 130, 246, 0.35)')
		.attr('stroke-width', Math.max(1, (brushPreview?.radiusPx || 12) * 2));

	layer
		.selectAll('polygon.current-brush-contour-fill')
		.data(brushContourPoints.length > 2 ? [brushContourPoints] : [])
		.join(
			(enter) => enter.append('polygon').attr('class', 'current-brush-contour-fill'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('points', toSvgPoints)
		.attr('fill', brushPreview?.contourFill || 'rgba(59, 130, 246, 0.16)')
		.attr('stroke', 'none');

	layer
		.selectAll('polyline.current-brush-contour')
		.data(brushContourPoints.length > 1 ? [brushContourPoints] : [])
		.join(
			(enter) =>
				enter
					.append('polyline')
					.attr('class', 'current-brush-contour')
					.attr('fill', 'none')
					.attr('stroke-linecap', 'round')
					.attr('stroke-linejoin', 'round'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('points', toSvgPoints)
		.attr('stroke', brushPreview?.contourStroke || '#2563eb')
		.attr('stroke-width', brushPreview?.contourWidth || 2)
		.attr('stroke-dasharray', brushPreview?.contourDash || '5 3');
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
