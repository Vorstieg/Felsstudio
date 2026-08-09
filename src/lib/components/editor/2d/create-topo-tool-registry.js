import { RouteTool } from '../tools/RouteTool.svelte.js';
import { SymbolTool } from '../tools/SymbolTool.svelte.js';
import { OutlineTool } from '../tools/OutlineTool.svelte.js';
import { EraserTool } from '../tools/EraserTool.svelte.js';
import { SelectTool } from '../tools/SelectTool.svelte.js';
import { SymbolEditTool } from '../tools/SymbolEditTool.svelte.js';
import { RouteEditTool } from '../tools/RouteEditTool.svelte.js';
import { OutlineEditTool } from '../tools/OutlineEditTool.svelte.js';
import { TextTool } from '../tools/TextTool.svelte.js';

/** Creates all tools from the editor's narrow capability context. */
export function createTopoToolRegistry({
	context,
	state,
	getTopo,
	getActiveTool,
	getEditablePath,
	getIsShiftPressed,
	getMobileSelectionMode,
	beginSelectionMove,
	setDrawingTarget,
	getSelectionSize,
	getSelectedSymbolId,
	snapRoutePoint,
	referenceFixpoint
}) {
	const config = { context, state };
	const editConfig = {
		context,
		getTopo,
		getActiveTool,
		getEditablePath,
		getIsShiftPressed,
		getMobileSelectionMode,
		beginSelectionMove
	};

	return {
		route: new RouteTool({
			...config,
			mode: 'route',
			snapPoint: snapRoutePoint,
			referenceFixpoint
		}),
		multipitch: new RouteTool({
			...config,
			mode: 'multipitch',
			snapPoint: snapRoutePoint,
			referenceFixpoint
		}),
		symbol: new SymbolTool(config),
		fixpoint: new SymbolTool(config),
		eraser: new EraserTool(config),
		outline: new OutlineTool(config),
		select: new SelectTool(config),
		text: new TextTool(config),
		routeEdit: new RouteEditTool({ ...editConfig, setDrawingTarget }),
		outlineEdit: new OutlineEditTool(editConfig),
		symbolEdit: new SymbolEditTool({
			...editConfig,
			getSelectionSize,
			getSelectedSymbolId,
			beginSelectionMove: (mouse) => ({ kind: 'move-selection', ...beginSelectionMove(mouse) })
		})
	};
}
