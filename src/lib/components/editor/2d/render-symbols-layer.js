import { select } from 'd3-selection';
import { topoSymbols } from '@vorstieg/topo-renderer';
import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';

/** Renders fixed-point symbols and their selection transform gizmos. */
export function renderSymbolsLayer({
	layers,
	topo,
	activeTool,
	baseWidth,
	baseHeight,
	selectedSymbolInstance,
	isSelected,
	canvasInput,
	symbolEditTool,
	basePath: base,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}) {
	const symbolsLayer = layers.symbols;
	const symbols = topo.fixPoints;
	// 5. Symbols (FixPoints) Rendering
	const symbolGroupSelection = symbolsLayer.selectAll('g.symbol-group').data(symbols, (d) => d.id);

	const symbolGroups = symbolGroupSelection
		.join(
			(enter) =>
				enter
					.append('g')
					.attr('class', 'symbol-group cursor-move')
					.style('touch-action', 'none')
					.on('mousedown', (event, symbol) => {
						if (activeTool === symbolEditTool?.id) {
							symbolEditTool.handlePointerDown(event, symbol.id, 'move', canvasInput);
						} else {
							handleObjectMouseDown(event, { type: 'symbol', id: symbol.id });
						}
					})
					.on('touchstart', (e, d) => {
						if (e.touches.length === 1) {
							if (activeTool === symbolEditTool?.id) {
								symbolEditTool.handleTouchStart(e, d.id, 'move', canvasInput);
							} else {
								e.preventDefault(); // Prevent emulated mousedown
								e.stopPropagation();
								canvasInput.trackTouch(e.touches[0]);
								handleObjectMouseDown(e.touches[0], { type: 'symbol', id: d.id });
							}
						}
					}),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr(
			'transform',
			(d) =>
				`translate(${(d.position2D?.[0] || 0) * baseWidth}, ${(d.position2D?.[1] || 0) * baseHeight}) rotate(${d.rotation2D || 0}) scale(${d.scale2D || 1})`
		)
		.attr('opacity', (d) =>
			selectedSymbolInstance?.id === d.id || isSelected('symbol', d.id) ? 0.9 : 1
		)
		.style(
			'pointer-events',
			activeTool !== 'select' && activeTool !== 'eraser' && activeTool !== symbolEditTool?.id
				? 'none'
				: 'auto'
		)
		.on('mousedown', (event, symbol) => {
			if (activeTool === 'select' || activeTool === symbolEditTool?.id) {
				symbolEditTool.handlePointerDown(event, symbol.id, 'move', canvasInput);
			} else {
				handleObjectMouseDown(event, { type: 'symbol', id: symbol.id });
			}
		})
		.on('touchstart', (event, symbol) => {
			if (event.touches.length !== 1) return;
			if (activeTool === 'select' || activeTool === symbolEditTool?.id) {
				symbolEditTool.handleTouchStart(event, symbol.id, 'move', canvasInput);
			} else {
				event.preventDefault();
				event.stopPropagation();
				canvasInput.trackTouch(event.touches[0]);
				handleObjectMouseDown(event.touches[0], { type: 'symbol', id: symbol.id });
			}
		})
		.on('click', (e, d) => {
			handleObjectClick(e, 'symbol', d.id);
		});

	// Invisible hit area for easier selecting on mobile
	symbolGroups
		.selectAll('circle.hit-area')
		.data((d) => [d])
		.join(
			(enter) => enter.append('circle').attr('class', 'hit-area').attr('fill', 'transparent'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('r', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			const radius = (meta?.width || 24) / 2;
			return getTouchTargetSize(radius);
		})
		.style(
			'pointer-events',
			activeTool !== 'select' && activeTool !== 'eraser' && activeTool !== symbolEditTool?.id
				? 'none'
				: 'all'
		);

	// Symbol Icon
	symbolGroups
		.selectAll('image.symbol-icon')
		.data((d) => [d])
		.join(
			(enter) => enter.append('image').attr('class', 'symbol-icon'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('width', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			return meta?.width || 24;
		})
		.attr('height', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			return meta?.height || 24;
		})
		.attr('x', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			return -(meta?.width || 24) / 2;
		})
		.attr('y', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			return -(meta?.height || 24) / 2;
		})
		.attr('href', (d) => {
			const meta = topoSymbols.find((s) => s.id === d.type);
			return meta?.icon || `${base}/icons/topo-symbols/${d.type}.svg`;
		});

	symbolEditTool?.render({ symbolGroups, activeTool, selectedSymbolInstance, canvasInput });
}
