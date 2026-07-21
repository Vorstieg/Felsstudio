/** Draws the transient marquee above topo content without intercepting input. */
export function renderSelectionRegion({ layers, region, baseWidth, baseHeight }) {
	layers.handles
		.selectAll('rect.selection-region')
		.data(region ? [region] : [])
		.join(
			(enter) =>
				enter
					.append('rect')
					.attr('class', 'selection-region')
					.attr('fill', 'rgba(59, 130, 246, 0.14)')
					.attr('stroke', '#2563eb')
					.attr('stroke-width', 1)
					.attr('stroke-dasharray', '4 3')
					.style('pointer-events', 'none'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('x', (item) => item.left * baseWidth)
		.attr('y', (item) => item.top * baseHeight)
		.attr('width', (item) => (item.right - item.left) * baseWidth)
		.attr('height', (item) => (item.bottom - item.top) * baseHeight);
}
