import { select } from 'd3-selection';
import { buildTopo2DRenderModel } from './topo-2d-render-model.js';
import { renderBackgroundLayer } from './render-background-layer.js';
import { renderCurrentLayer } from './render-current-layer.js';
import { renderOutlinesLayer } from './render-outlines-layer.js';
import { renderRoutesLayer } from './render-routes-layer.js';
import { renderSymbolsLayer } from './render-symbols-layer.js';
import { renderTextLabelsLayer } from './render-text-labels-layer.js';
import { createTopoLayerStack } from './create-topo-layer-stack.js';
import { createSelectionRegion } from './selection-geometry.js';
import { renderSelectionRegion } from './render-selection-region.js';

export function renderTopo2D({
	svgElement,
	gElement,
	editor,
	baseWidth,
	baseHeight,
	currentRoutePoints,
	currentOutlinePoints,
	outlinePreview,
	brushPreview,
	canvasInput,
	editTools,
	draftTools,
	textTool,
	basePath,
	onObjectMouseDown,
	onObjectClick,
	onTextMouseDown
}) {
	if (!svgElement || !gElement) return;

	const svg = select(svgElement);
	const layers = createTopoLayerStack(gElement);
	const renderModel = buildTopo2DRenderModel({
		topo: editor.topo,
		isSelected: editor.isSelected,
		isRoutePointSelected: editor.isRoutePointSelected,
		selectionSize: editor.selectedItems.size,
		activeTool: editor.ui.activeTool,
		drawingTarget: editor.ui.drawingTarget,
		isInteractionActive:
			editor.interaction && !['move-point', 'move-points'].includes(editor.interaction.kind),
		baseWidth,
		baseHeight,
		currentRoutePoints,
		currentOutlinePoints
	});
	const renderContext = {
		svg,
		layers,
		topo: editor.topo,
		renderModel,
		activeTool: editor.ui.activeTool,
		baseWidth,
		baseHeight,
		currentRoutePoints,
		currentOutlinePoints,
		selectedOutlineStyle: editor.ui.selectedOutlineStyle,
		outlinePreview,
		brushPreview,
		canvasInput,
		editTools,
		isSelected: editor.isSelected,
		selectedSymbolInstance: editor.selectedSymbolInstance,
		textTool,
		basePath,
		onObjectMouseDown,
		onObjectClick,
		onTextMouseDown
	};

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
			editor.interaction?.kind === 'selection-region'
				? createSelectionRegion(editor.interaction.start, editor.interaction.end)
				: null,
		baseWidth,
		baseHeight
	});
}
