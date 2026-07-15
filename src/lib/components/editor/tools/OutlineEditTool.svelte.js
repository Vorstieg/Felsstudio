import { EditablePathEditTool } from './EditablePathEditTool.svelte.js';

/** Editing interactions for persisted 2D rock outlines. */
export class OutlineEditTool extends EditablePathEditTool {
	constructor({
		getActiveTool,
		getEditablePath,
		startInteraction,
		saveHistory,
		isSelected,
		selectObject,
		getIsShiftPressed,
		beginSelectionMove
	} = {}) {
		super({
			id: 'outlineEdit',
			getActiveTool,
			getEditablePath,
			startInteraction,
			saveHistory,
			targetFromPoint: ({ outlineId }) => ({ outlineId }),
			targetFromMidpoint: ({ outlineId }) => ({ outlineId })
		});
		this.isSelected = isSelected || (() => false);
		this.selectObject = selectObject || (() => {});
		this.getIsShiftPressed = getIsShiftPressed || (() => false);
		this.beginSelectionMove = beginSelectionMove || (() => null);
	}

	handleOutlineDown(event, outline, canvasInput) {
		if (!this.isEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		event.stopPropagation?.();

		if (!this.isSelected('outline', outline.id)) {
			this.selectObject('outline', outline.id, this.getIsShiftPressed());
		}
		this.startInteraction('move-selection', this.beginSelectionMove(mouse));
		return true;
	}

	handleTouchOutlineDown(event, outline, canvasInput) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackTouch(event.touches[0]);
		return this.handleOutlineDown(event.touches[0], outline, canvasInput);
	}

	render({ layers, renderModel, baseWidth, baseHeight, canvasInput }) {
		this.renderControls({
			layers,
			pointHandles: renderModel.outlines.handles,
			midpoints: renderModel.outlines.midpoints,
			pointKey: (item) => `outline-${item.outlineId}-handle-${item.index}`,
			midpointKey: (item) => `outline-${item.outlineId}-mid-${item.insertIndex}`,
			pointTarget: (item) => ({ outlineId: item.outlineId, index: item.index }),
			midpointTarget: (item) => item,
			canvasInput,
			baseWidth,
			baseHeight
		});
	}

	onMouseDown() {}
	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}
