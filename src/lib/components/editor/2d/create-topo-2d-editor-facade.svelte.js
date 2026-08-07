import { createTopo2DEditorController } from './create-topo-2d-editor-controller.svelte.js';
import { createTopoHistory } from './create-topo-history.svelte.js';
import { createTopoClipboard } from './topo-clipboard.js';
import { createTopoEditCommands } from './create-topo-edit-commands.js';

/**
 * Composition root for one 2D editing session.
 *
 * The Svelte component owns DOM/rendering concerns; this façade owns the
 * document-facing editor services and exposes one stable surface to tools and
 * toolbar adapters.
 */
export function createTopo2DEditorFacade({
	getTopo,
	ui,
	restore,
	getCanvasSize,
	getDrawingTarget,
	setDrawingTarget,
	getImageSrc,
	getImageFit
}) {
	const selection = createTopo2DEditorController({ getTopo, ui });
	const history = createTopoHistory({ getTopo, restore });
	const commands = createTopoEditCommands({
		getTopo,
		selection,
		saveHistory: () => history.save()
	});
	const clipboard = createTopoClipboard();
	const toolContext = {
		document: { getTopo, ui },
		selection: {
			selectObject: selection.selectObject,
			selectedId: selection.selectedId,
			isSelected: selection.isSelected,
			removeItems: selection.removeItems,
			clear: selection.clearSelection,
			startInteraction: selection.startInteraction,
			getInteraction: () => selection.interaction
		},
		history: { save: () => history.save() },
		viewport: { getCanvasSize },
		drawing: { getTarget: getDrawingTarget, setTarget: setDrawingTarget },
		image: { getSrc: getImageSrc, getFit: getImageFit },
		commands
	};

	return {
		selection,
		history,
		commands,
		clipboard,
		toolContext,
		get selectedItems() {
			return selection.selectedItems;
		},
		get selectedSymbolInstance() {
			return selection.selectedSymbolInstance;
		},
		get interaction() {
			return selection.interaction;
		},
		clearSelection: selection.clearSelection,
		selectedId: selection.selectedId,
		isSelected: selection.isSelected,
		selectObject: selection.selectObject,
		selectItems: selection.selectItems,
		removeItems: selection.removeItems,
		reconcileSelection: selection.reconcileSelection,
		startInteraction: selection.startInteraction,
		endInteraction: selection.endInteraction,
		get saveHistory() {
			return history.save;
		},
		undo: history.undo,
		redo: history.redo
	};
}
