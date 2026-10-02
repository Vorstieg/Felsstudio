import type { TopoRenderContext } from './topo-render-context.ts';

/** Renders the static image/grid canvas layer. */
export function renderBackgroundLayer({
	svg,
	layers,
	topo,
	baseWidth,
	baseHeight
}: Pick<TopoRenderContext, 'svg' | 'layers' | 'topo' | 'baseWidth' | 'baseHeight'>): void {
	const layer = layers.background;
	const image = typeof topo.image2D === 'string' ? topo.image2D : null;
	const fit = topo.backgroundFit === 'cover' ? 'slice' : 'meet';
	layer
		.selectAll<SVGImageElement, string>('image.bg-image')
		.data(image ? [image] : [])
		.join(
			(enter) => enter.append('image').attr('class', 'bg-image'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('href', (value) => value)
		.attr('x', 0)
		.attr('y', 0)
		.attr('width', baseWidth)
		.attr('height', baseHeight)
		// The image is a background asset, not the coordinate system. Never stretch it
		// to a new canvas aspect ratio because that would mislead annotation placement.
		.attr('preserveAspectRatio', `xMidYMid ${fit}`);

	layer
		.selectAll<SVGRectElement, number>('rect.blank-bg')
		.data(image ? [] : [1])
		.join(
			(enter) => enter.append('rect').attr('class', 'blank-bg'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('width', baseWidth)
		.attr('height', baseHeight)
		.attr('fill', '#f9fafb');

	if (!image) {
		let defs = svg.select<SVGDefsElement>('defs');
		if (defs.empty()) defs = svg.append('defs');
		if (defs.select('#grid-pattern').empty()) {
			defs
				.append('pattern')
				.attr('id', 'grid-pattern')
				.attr('width', 50)
				.attr('height', 50)
				.attr('patternUnits', 'userSpaceOnUse')
				.append('path')
				.attr('d', 'M 50 0 L 0 0 0 50')
				.attr('fill', 'none')
				.attr('stroke', '#e5e7eb')
				.attr('stroke-width', 1);
		}
	}

	layer
		.selectAll<SVGRectElement, number>('rect.grid-bg')
		.data(image ? [] : [1])
		.join(
			(enter) => enter.append('rect').attr('class', 'grid-bg'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('width', baseWidth)
		.attr('height', baseHeight)
		.attr('fill', 'url(#grid-pattern)');
}
