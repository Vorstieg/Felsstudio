/** Shared point and midpoint editing behavior for persisted editable paths. */
export class EditablePathEditTool {
	constructor({
		context,
		id,
		getActiveTool,
		getEditablePath,
		mutateDocument,
		startInteraction,
		saveHistory,
		isSelected,
		selectObject,
		getIsShiftPressed,
		getMobileSelectionMode,
		beginSelectionMove,
		targetFromPoint,
		targetFromMidpoint
	} = {}) {
		this.id = id;
		this.getActiveTool = getActiveTool || (() => null);
		this.getEditablePath = getEditablePath || (() => null);
		this.mutateDocument =
			context?.commands?.mutateDocument || mutateDocument || ((mutator) => mutator());
		this.startInteraction = startInteraction || (() => {});
		this.saveHistory = context?.history?.save || saveHistory || (() => {});
		this.isSelected = context?.selection?.isSelected || isSelected || (() => false);
		this.selectObject = context?.selection?.selectObject || selectObject || (() => {});
		this.getIsShiftPressed = getIsShiftPressed || (() => false);
		this.getMobileSelectionMode = getMobileSelectionMode || (() => false);
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.targetFromPoint = targetFromPoint || (() => null);
		this.targetFromMidpoint = targetFromMidpoint || (() => null);
	}

	isEditMode(activeTool = this.getActiveTool()) {
		return activeTool === 'select' || activeTool === this.id || activeTool === 'eraser';
	}

	handlePointDown(event, point, _canvasInput) {
		if (!this.isEditMode()) return false;
		const target = this.targetFromPoint(point);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		event.stopPropagation?.();

		if (event.altKey || this.getActiveTool() === 'eraser') {
			if (!path.canRemovePoint()) return false;
			this.mutateDocument(() => path.removePoint(point.index));
			this.saveHistory();
			return true;
		}

		this.startInteraction('move-point', { ...target, pointIndex: point.index });
		return true;
	}

	handleMidpointDown(event, midpoint, _canvasInput) {
		if (!this.isEditMode()) return false;
		const target = this.targetFromMidpoint(midpoint);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		event.stopPropagation?.();
		this.mutateDocument(() =>
			path.insertPoint(midpoint.insertIndex, [midpoint.midX, midpoint.midY])
		);
		this.startInteraction('move-point', { ...target, pointIndex: midpoint.insertIndex });
		return true;
	}

	/** Shared select, erase, and drag behavior for a rendered editable item. */
	handleItemDown(
		event,
		item,
		canvasInput,
		{ type, getId = (value) => value?.id, remove, beforeMove } = {}
	) {
		if (!this.isEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		event.stopPropagation?.();

		const id = getId(item);
		if (id == null) return false;
		if (this.getActiveTool() === 'eraser') {
			if (remove?.([id])) this.saveHistory();
			return true;
		}
		if (event?.identifier != null && this.getMobileSelectionMode()) {
			this.selectObject(type, id, true);
			return true;
		}
		if (this.getIsShiftPressed()) {
			this.selectObject(type, id, true);
			return true;
		}

		const shouldSelect = beforeMove?.(item, id) !== false;
		if (shouldSelect && !this.isSelected(type, id)) {
			this.selectObject(type, id, false);
		}
		this.startInteraction('move-selection', this.beginSelectionMove(mouse));
		return true;
	}

	handleTouchItemDown(event, item, canvasInput, options) {
		return this.handleTouchControl(
			event,
			(touchEvent) => this.handleItemDown(touchEvent, item, canvasInput, options),
			item,
			canvasInput
		);
	}

	handleTouchControl(event, handler, item, canvasInput) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackTouch(event.touches[0]);
		return handler.call(this, event.touches[0], item, canvasInput);
	}

	/** Renders compact editable vertices and insertion midpoints with touch hit areas. */
	renderControls({
		layers,
		pointHandles,
		midpoints,
		pointKey,
		midpointKey,
		pointTarget,
		midpointTarget,
		canvasInput,
		baseWidth,
		baseHeight
	}) {
		const handlesLayer = layers.handles
			.selectAll(`g.${this.id}-controls`)
			.data([null])
			.join('g')
			.attr('class', `editable-path-controls ${this.id}-controls`);
		const isErasing = this.getActiveTool() === 'eraser';

		handlesLayer
			.selectAll('circle.editable-path-point-hit-area')
			.data(pointHandles, pointKey)
			.join('circle')
			.attr('class', `editable-path-point-hit-area ${isErasing ? 'cursor-pointer' : 'cursor-move'}`)
			.attr('cx', (item) => item.point[0] * baseWidth)
			.attr('cy', (item) => item.point[1] * baseHeight)
			.attr('r', (item) => item.hitSize)
			.attr('fill', 'transparent')
			.on('mousedown', (event, item) => this.handlePointDown(event, pointTarget(item), canvasInput))
			.on('touchstart', (event, item) =>
				this.handleTouchControl(event, this.handlePointDown, pointTarget(item), canvasInput)
			)
			.on('click', (event) => event.stopPropagation());

		handlesLayer
			.selectAll('circle.editable-path-point-handle')
			.data(pointHandles, pointKey)
			.join('circle')
			.attr('class', 'editable-path-point-handle')
			.attr('cx', (item) => item.point[0] * baseWidth)
			.attr('cy', (item) => item.point[1] * baseHeight)
			.attr('r', (item) => item.handleSize)
			.attr('fill', (item) => (isErasing ? '#fee2e2' : item.selected ? '#f59e0b' : 'white'))
			.attr('stroke', isErasing ? '#ef4444' : '#3b82f6')
			.attr('stroke-width', 2)
			.style('pointer-events', 'none');

		handlesLayer
			.selectAll('circle.editable-path-midpoint-hit-area')
			.data(midpoints, midpointKey)
			.join('circle')
			.attr('class', 'editable-path-midpoint-hit-area cursor-pointer')
			.attr('cx', (item) => item.midX * baseWidth)
			.attr('cy', (item) => item.midY * baseHeight)
			.attr('r', (item) => item.midpointHitSize)
			.attr('fill', 'transparent')
			.on('mousedown', (event, item) =>
				this.handleMidpointDown(event, midpointTarget(item), canvasInput)
			)
			.on('touchstart', (event, item) =>
				this.handleTouchControl(event, this.handleMidpointDown, midpointTarget(item), canvasInput)
			);

		handlesLayer
			.selectAll('circle.editable-path-midpoint')
			.data(midpoints, midpointKey)
			.join('circle')
			.attr('class', 'editable-path-midpoint')
			.attr('cx', (item) => item.midX * baseWidth)
			.attr('cy', (item) => item.midY * baseHeight)
			.attr('r', (item) => item.midpointSize)
			.attr('fill', '#3b82f6')
			.attr('opacity', 0.6)
			.attr('stroke', 'white')
			.attr('stroke-width', 1)
			.style('pointer-events', 'none');

		// Midpoint hit targets can overlap nearby vertices on short segments.
		// Keep vertex targets last in SVG paint order so an existing point wins.
		handlesLayer.selectAll('circle.editable-path-point-hit-area').raise();
	}
}
