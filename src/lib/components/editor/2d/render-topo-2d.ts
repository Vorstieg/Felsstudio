import { select } from 'd3-selection';
import { buildTopo2DRenderModel } from './topo-2d-render-model.ts';
import { renderBackgroundLayer } from './render-background-layer.ts';
import { renderCurrentLayer } from './render-current-layer.ts';
import { renderOutlinesLayer } from './render-outlines-layer.ts';
import { renderRoutesLayer } from './render-routes-layer.ts';
import { renderSymbolsLayer } from './render-symbols-layer.ts';
import { renderTextLabelsLayer } from './render-text-labels-layer.ts';
import { createTopoLayerStack } from './create-topo-layer-stack.ts';
import { createSelectionRegion } from './selection-geometry.ts';
import { renderSelectionRegion } from './render-selection-region.ts';
import type { RenderTopo2DInput, TopoRenderContext } from './topo-render-context.ts';

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
}: RenderTopo2DInput): void {
	if (!svgElement || !gElement) return;

	const svg = select(svgElement);
	const layers = createTopoLayerStack(gElement);
	const renderModel = buildTopo2DRenderModel({
		topo: editor.topo,
		isSelected: (type, id) =>
			editor.isSelected(type as Parameters<typeof editor.isSelected>[0], id),
		isRoutePointSelected: editor.isRoutePointSelected,
		selectionSize: editor.selectedItems.size,
		activeTool: editor.ui.activeTool,
		drawingTarget: editor.ui.drawingTarget,
		isInteractionActive: Boolean(
			editor.interaction && !['move-point', 'move-points'].includes(editor.interaction.kind)
		),
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
		onTextMouseDown,
		hideControlPoints: ['move-point', 'move-points', 'transform-preset-outline'].includes(
			editor.interaction?.kind ?? ''
		)
	} satisfies TopoRenderContext;

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
