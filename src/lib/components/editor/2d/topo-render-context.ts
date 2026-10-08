import type { Selection } from 'd3-selection';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { CanvasInput } from './create-canvas-input.svelte.ts';
import type { TopoLayerStack } from './create-topo-layer-stack.ts';
import type { Topo2DRenderModel } from './topo-2d-render-model.ts';
import type { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.ts';
import type { RouteTool } from '../tools/RouteTool.svelte.ts';
import type { OutlineTool } from '../tools/OutlineTool.svelte.ts';
import type { RouteEditTool } from '../tools/RouteEditTool.svelte.ts';
import type { OutlineEditTool } from '../tools/OutlineEditTool.svelte.ts';
import type { SymbolEditTool } from '../tools/SymbolEditTool.svelte.ts';
import type { TextTool } from '../tools/TextTool.svelte.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type ObjectInteractions = ReturnType<typeof createTopoObjectInteractionController>;
export type OutlinePreview = {
	baseWidth: number;
	baseHeight: number;
	mode: OutlineTool['mode'] | null;
	fillColor: string | null;
	fillOpacity: number | null;
};
export type BrushPreview = ReturnType<OutlineTool['getBrushPreview']>;
export type EditTools = {
	route: RouteEditTool;
	outline: OutlineEditTool;
	symbol: SymbolEditTool;
};
export type DraftTools = { route: RouteTool; multipitch: RouteTool };

export type TopoRenderContext = {
	svg: Selection<SVGSVGElement, unknown, null, undefined>;
	layers: TopoLayerStack;
	topo: Editor['topo'];
	renderModel: Topo2DRenderModel;
	activeTool: string;
	baseWidth: number;
	baseHeight: number;
	currentRoutePoints: Point2D[];
	currentOutlinePoints: Point2D[];
	selectedOutlineStyle: string;
	outlinePreview: OutlinePreview;
	brushPreview: BrushPreview;
	canvasInput: CanvasInput;
	editTools: EditTools;
	isSelected: Editor['isSelected'];
	selectedSymbolInstance: Editor['selectedSymbolInstance'];
	textTool: TextTool;
	basePath: string;
	onObjectMouseDown: ObjectInteractions['objectMouseDown'];
	onObjectClick: ObjectInteractions['objectClick'];
	onTextMouseDown: ObjectInteractions['textMouseDown'];
	hideControlPoints: boolean;
};

export type RenderTopo2DInput = {
	svgElement: SVGSVGElement | null;
	gElement: SVGGElement | null;
	editor: Editor;
	baseWidth: number;
	baseHeight: number;
	currentRoutePoints: Point2D[];
	currentOutlinePoints: Point2D[];
	outlinePreview: OutlinePreview;
	brushPreview: BrushPreview;
	canvasInput: CanvasInput;
	editTools: EditTools;
	draftTools: DraftTools;
	textTool: TextTool;
	basePath: string;
	onObjectMouseDown: ObjectInteractions['objectMouseDown'];
	onObjectClick: ObjectInteractions['objectClick'];
	onTextMouseDown: ObjectInteractions['textMouseDown'];
};
