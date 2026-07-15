import { select } from 'd3-selection';

/**
 * Owns the stable SVG group hierarchy for the 2D editor.
 *
 * Renderers receive one of these named layers and never need to know about
 * the editor's root <g>. Keeping the order here makes SVG stacking explicit.
 */
export function createTopoLayerStack(rootElement) {
	const root = select(rootElement);

	function getOrCreate(name, { touchActionNone = false } = {}) {
		let layer = root.select(`g.${name}`);
		if (layer.empty()) {
			layer = root.append('g').attr('class', name);
			if (touchActionNone) layer.style('touch-action', 'none');
		}
		return layer;
	}

	return {
		background: getOrCreate('background-layer'),
		outlines: getOrCreate('outlines-layer', { touchActionNone: true }),
		routes: getOrCreate('routes-layer'),
		current: getOrCreate('current-layer'),
		handles: getOrCreate('handles-layer', { touchActionNone: true }),
		symbols: getOrCreate('symbols-layer'),
		text: getOrCreate('text-layer', { touchActionNone: true })
	};
}
