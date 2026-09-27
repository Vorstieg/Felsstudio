import { RouteTool } from '../tools/RouteTool.svelte.ts';
import { SymbolTool } from '../tools/SymbolTool.svelte.ts';
import { OutlineTool } from '../tools/OutlineTool.svelte.ts';
import { EraserTool } from '../tools/EraserTool.svelte.ts';
import { SelectTool } from '../tools/SelectTool.svelte.ts';
import { SymbolEditTool } from '../tools/SymbolEditTool.svelte.ts';
import { RouteEditTool } from '../tools/RouteEditTool.svelte.ts';
import { OutlineEditTool } from '../tools/OutlineEditTool.svelte.ts';
import { TextTool } from '../tools/TextTool.svelte.ts';
import type { Route } from '@vorstieg/fels-types/types';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type {
	EditablePathTarget,
	InteractionId,
	InteractionPoint,
	SelectionSnapshot
} from '$lib/state/topo-2d-editor-interactions.ts';
import type { EditablePath } from './editable-path.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type CanvasSize = Pick<Editor['viewport'], 'baseWidth' | 'baseHeight'>;
type SnapResult = { point: InteractionPoint; anchorId: InteractionId | null };

export type TopoTool = {
	id: string;
	onActivate: () => unknown;
	onDeactivate: () => unknown;
};

export type TopoToolRegistry = {
	route: RouteTool;
	multipitch: RouteTool;
	symbol: SymbolTool;
	fixpoint: SymbolTool;
	eraser: EraserTool;
	outline: OutlineTool;
	select: SelectTool;
	text: TextTool;
	routeEdit: RouteEditTool;
	outlineEdit: OutlineEditTool;
	symbolEdit: SymbolEditTool;
};

type TopoToolRegistryOptions = {
	editor: Editor;
	getCanvasSize: () => CanvasSize;
	getEditablePath: (target: EditablePathTarget) => EditablePath | null;
	beginSelectionMove: (mouse: InteractionPoint) => SelectionSnapshot;
	snapRoutePoint: (point: InteractionPoint) => SnapResult;
	referenceFixpoint: (route: Route, fixPointId: InteractionId | null) => void;
};

/** Creates tools from the editor plus their few external interaction services. */
export function createTopoToolRegistry({
	editor,
	getCanvasSize,
	getEditablePath,
	beginSelectionMove,
	snapRoutePoint,
	referenceFixpoint
}: TopoToolRegistryOptions): TopoToolRegistry {
	const createRouteTool = (mode: 'route' | 'multipitch') => {
		const tool = new RouteTool(editor, { snapPoint: snapRoutePoint, referenceFixpoint });
		tool.mode = mode;
		tool.id = mode;
		return tool;
	};

	const registry = {
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
			beginSelectionMove: (mouse: InteractionPoint) => ({
				kind: 'move-selection',
				...beginSelectionMove(mouse)
			}),
			getCanvasSize
		})
	} satisfies TopoToolRegistry;
	return registry;
}
