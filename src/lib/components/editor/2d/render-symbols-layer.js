import { topoSymbols } from '@vorstieg/topo-renderer';

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
	editTools,
	basePath: base,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}) {
	const symbolEditTool = editTools?.symbol;
	const symbolsLayer = layers.symbols;
	const symbols = topo.fixPoints;
	const hasSelectedRouteOrOutline =
		topo.routes.some((route) => isSelected('route', route.id)) ||
		topo.outlines.some((outline) => isSelected('outline', outline.id));
	const symbolsSelectable =
		!hasSelectedRouteOrOutline &&
		(activeTool === 'select' || activeTool === 'eraser' || activeTool === symbolEditTool?.id);
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
		.attr('data-testid', (symbol) => `topo-object-symbol-${symbol.id}`)
		.attr(
			'transform',
			(d) =>
				`translate(${(d.position2D?.[0] || 0) * baseWidth}, ${(d.position2D?.[1] || 0) * baseHeight}) rotate(${d.rotation2D || 0})`
		)
		.attr('opacity', (d) =>
			selectedSymbolInstance?.id === d.id || isSelected('symbol', d.id) ? 0.9 : 1
		)
		.style('pointer-events', symbolsSelectable ? 'auto' : 'none')
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
		})
		.attr('transform', (d) => {
			const scale = d.scale2D || 1;
			return `scale(${scale * (d.scaleX2D || 1)}, ${scale * (d.scaleY2D || 1)})`;
		})
		.style('pointer-events', symbolsSelectable ? 'all' : 'none');

	symbolEditTool?.render({ symbolGroups, activeTool, selectedSymbolInstance, canvasInput });
}
