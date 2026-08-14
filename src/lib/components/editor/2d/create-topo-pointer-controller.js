import {
	createSelectionRegion,
	getRegionSelection,
	getRoutePointRegionSelection
} from './selection-geometry.js';

/** Owns the normalized pointer down/up lifecycle for the 2D editor. */
export function createTopoPointerController({
	editor,
	getCurrentTool,
	textTool,
	getCanvasSize
} = {}) {
	function down(input) {
		if (!input || (input.button !== 0 && !input.isTouch)) return;
		const { point, sourceEvent: event } = input;
		if (textTool?.editingPosition) {
			textTool.commitEdit();
			event.stopPropagation?.();
			return;
		}

		if (['symbolEdit', 'routeEdit', 'outlineEdit'].includes(editor.ui.activeTool)) {
			editor.clearSelection();
			editor.setDrawingTarget(null);
			editor.setActiveTool('select');
			return;
		}

		if (editor.ui.activeTool === 'select') {
			editor.startInteraction('selection-region', {
				start: point,
				end: point,
				mode:
					input.isTouch && editor.ui.mobileSelectionMode
						? 'add'
						: event.altKey
							? 'subtract'
							: input.shiftKey
								? 'add'
								: 'replace'
			});
			return;
		}

		getCurrentTool()?.onMouseDown?.(event, point);
	}

	function up(input) {
		if (!input) return;
		const { point, sourceEvent: event } = input;
		getCurrentTool()?.onMouseUp?.(event, point);

		const interaction = editor.endInteraction();
		if (interaction?.kind === 'selection-region') {
			const region = createSelectionRegion(interaction.start, interaction.end);
			const moved = Math.hypot(region.right - region.left, region.bottom - region.top) > 0.005;
			if (moved) {
				const selectedRouteId = editor.ui.selectedRouteId;
				const routePoints = selectedRouteId
					? getRoutePointRegionSelection(editor.topo, selectedRouteId, editor.ui.drawingTarget)
					: [];
				if (routePoints.length) editor.selectRoutePoints(routePoints, interaction.mode);
				else {
					editor.selectRoutePoints([], 'replace');
					editor.selectItems(
						getRegionSelection(editor.topo, region, getCanvasSize()),
						interaction.mode
					);
				}
			} else if (interaction.mode === 'replace') {
				editor.clearSelection();
			}
		} else if (interaction) {
			editor.saveHistory();
		}
	}

	return { down, up };
}
