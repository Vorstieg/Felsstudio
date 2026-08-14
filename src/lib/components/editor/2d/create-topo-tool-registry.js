import { RouteTool } from '../tools/RouteTool.svelte.js';
import { SymbolTool } from '../tools/SymbolTool.svelte.js';
import { OutlineTool } from '../tools/OutlineTool.svelte.js';
import { EraserTool } from '../tools/EraserTool.svelte.js';
import { SelectTool } from '../tools/SelectTool.svelte.js';
import { SymbolEditTool } from '../tools/SymbolEditTool.svelte.js';
import { RouteEditTool } from '../tools/RouteEditTool.svelte.js';
import { OutlineEditTool } from '../tools/OutlineEditTool.svelte.js';
import { TextTool } from '../tools/TextTool.svelte.js';

/** Creates tools from the editor plus their few external interaction services. */
export function createTopoToolRegistry({
	editor,
	getCanvasSize,
	getEditablePath,
	beginSelectionMove,
	snapRoutePoint,
	referenceFixpoint
}) {
	const createRouteTool = (mode) => {
		const tool = new RouteTool(editor, { snapPoint: snapRoutePoint, referenceFixpoint });
		tool.mode = mode;
		tool.id = mode;
		return tool;
	};

	return {
		route: createRouteTool('route'),
		multipitch: createRouteTool('multipitch'),
		symbol: new SymbolTool(editor),
		fixpoint: new SymbolTool(editor),
		eraser: new EraserTool(editor),
		outline: new OutlineTool(editor, { getCanvasSize }),
		select: new SelectTool(editor),
		text: new TextTool(editor),
		routeEdit: new RouteEditTool(editor, {
			getEditablePath,
			beginSelectionMove
		}),
		outlineEdit: new OutlineEditTool(editor, {
			getEditablePath,
			beginSelectionMove,
			getCanvasSize
		}),
		symbolEdit: new SymbolEditTool(editor, {
			beginSelectionMove: (mouse) => ({ kind: 'move-selection', ...beginSelectionMove(mouse) }),
			getCanvasSize
		})
	};
}
