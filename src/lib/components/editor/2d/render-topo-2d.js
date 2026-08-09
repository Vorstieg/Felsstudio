import { select } from 'd3-selection';
import { buildTopo2DRenderModel } from './topo-2d-render-model.js';
import { renderBackgroundLayer } from './render-background-layer.js';
import { renderCurrentLayer } from './render-current-layer.js';
import { renderOutlinesLayer } from './render-outlines-layer.js';
import { renderRoutesLayer } from './render-routes-layer.js';
import { renderSymbolsLayer } from './render-symbols-layer.js';
import { renderTextLabelsLayer } from './render-text-labels-layer.js';
import { createTopoLayerStack } from './create-topo-layer-stack.js';
import { createTopo2DRenderContext } from './create-topo-render-context.js';
import { createSelectionRegion } from './selection-geometry.js';
import { renderSelectionRegion } from './render-selection-region.js';

export function renderTopo2D({
	svgElement,
	gElement,
	topo,
	ui,
	activeTool,
	drawingTarget,
	baseWidth,
	baseHeight,
	currentRoutePoints,
	currentOutlinePoints,
	selectedOutlineStyle,
	outlinePreview,
	brushPreview,
	canvasInput,
	editTools,
	draftTools,
	isSelected,
	selectionSize,
	selectedSymbolInstance,
	textTool,
	interaction,
	basePath,
	onObjectMouseDown,
	onObjectClick,
	onLabelMouseDown,
	onTextMouseDown,
	setActiveTouch
}) {
	if (!svgElement || !gElement) return;

	const svg = select(svgElement);
	const layers = createTopoLayerStack(gElement);
	const renderModel = buildTopo2DRenderModel({
		topo,
		ui,
		isSelected,
		selectionSize,
		activeTool,
		drawingTarget,
		isInteractionActive: interaction && interaction.kind !== 'move-point',
		baseWidth,
		baseHeight,
		currentRoutePoints,
		currentOutlinePoints
	});
	const renderContext = createTopo2DRenderContext({
		svg,
		layers,
		topo,
		renderModel,
		activeTool,
		baseWidth,
		baseHeight,
		currentRoutePoints,
		currentOutlinePoints,
		selectedOutlineStyle,
		outlinePreview,
		brushPreview,
		canvasInput,
		editTools,
		isSelected,
		selectedSymbolInstance,
		textTool,
		basePath,
		onObjectMouseDown,
		onObjectClick,
		onLabelMouseDown,
		onTextMouseDown,
		setActiveTouch
	});

	renderBackgroundLayer(renderContext);
	renderOutlinesLayer(renderContext);
	renderRoutesLayer(renderContext);
	renderCurrentLayer(renderContext);
	draftTools.route.render(renderContext);
	draftTools.multipitch.render(renderContext);
	renderSymbolsLayer(renderContext);
	renderTextLabelsLayer(renderContext);
	renderSelectionRegion({
		layers,
		region:
			interaction?.kind === 'selection-region'
				? createSelectionRegion(interaction.start, interaction.end)
				: null,
		baseWidth,
		baseHeight
	});
}
