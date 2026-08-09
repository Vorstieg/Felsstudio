/**
 * Creates the complete input contract shared by every 2D SVG renderer.
 *
 * Renderers may read only the fields they need. Keeping canvas state,
 * rendering data, and editor callbacks in one context prevents individual
 * layer APIs from drifting as the editor evolves.
 */
export function createTopo2DRenderContext({
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
	onRotateGizmoMouseDown,
	onScaleGizmoMouseDown,
	setActiveTouch
}) {
	return {
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
		onRotateGizmoMouseDown,
		onScaleGizmoMouseDown,
		setActiveTouch
	};
}
