import { createSelectionRegion, getRegionSelection } from './selection-geometry.js';

/** Owns the normalized pointer down/up lifecycle for the 2D editor. */
export function createTopoPointerController({
	getActiveTool,
	getCurrentTool,
	getEditingTextId,
	commitTextEdit,
	getMobileSelectionMode,
	getTopo,
	getCanvasSize,
	selection,
	clearSelection,
	deselectEditTarget,
	saveHistory,
	onBeginSelectionRegion,
	onCommitSelectionRegion
} = {}) {
	function down(input) {
		if (!input || (input.button !== 0 && !input.isTouch)) return;
		const { point, sourceEvent: event } = input;

		if (getEditingTextId?.()) {
			commitTextEdit?.();
			event.stopPropagation?.();
			return;
		}
		if (['symbolEdit', 'routeEdit', 'outlineEdit'].includes(getActiveTool())) {
			deselectEditTarget?.();
			return;
		}

		if (getActiveTool() === 'select') {
			onBeginSelectionRegion?.({
				start: point,
				end: point,
				mode:
					input.isTouch && getMobileSelectionMode?.()
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

		const interaction = selection.endInteraction();
		if (interaction?.kind === 'selection-region') {
			const region = createSelectionRegion(interaction.start, interaction.end);
			const moved = Math.hypot(region.right - region.left, region.bottom - region.top) > 0.005;
			if (moved) {
				selection.selectItems(
					getRegionSelection(getTopo(), region, getCanvasSize()),
					interaction.mode
				);
			} else if (interaction.mode === 'replace') {
				clearSelection?.();
			}
			onCommitSelectionRegion?.(interaction);
		} else if (interaction) {
			saveHistory?.();
		}
	}

	return { down, up };
}
