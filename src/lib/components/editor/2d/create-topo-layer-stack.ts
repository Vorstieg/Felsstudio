import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';

export type TopoLayer = Selection<SVGGElement, unknown, null, undefined>;
export type TopoLayerStack = Record<
	'background' | 'outlines' | 'routes' | 'current' | 'handles' | 'symbols' | 'text',
	TopoLayer
>;

/**
 * Owns the stable SVG group hierarchy for the 2D editor.
 *
 * Renderers receive one of these named layers and never need to know about
 * the editor's root <g>. Keeping the order here makes SVG stacking explicit.
 */
export function createTopoLayerStack(rootElement: SVGGElement): TopoLayerStack {
	const root = select(rootElement);

	function getOrCreate(
		name: string,
		{ touchActionNone = false }: { touchActionNone?: boolean } = {}
	): TopoLayer {
		let layer = root.select<SVGGElement>(`g.${name}`);
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
		// Text is intentionally last so annotations remain legible above symbols.
		text: getOrCreate('text-layer', { touchActionNone: true })
	};
}
