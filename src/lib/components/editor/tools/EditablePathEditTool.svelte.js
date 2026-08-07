/** Shared point and midpoint editing behavior for persisted editable paths. */
export class EditablePathEditTool {
	constructor({
		context,
		id,
		getActiveTool,
		getEditablePath,
		startInteraction,
		saveHistory,
		targetFromPoint,
		targetFromMidpoint
	} = {}) {
		this.id = id;
		this.getActiveTool = getActiveTool || (() => null);
		this.getEditablePath = getEditablePath || (() => null);
		this.startInteraction = startInteraction || (() => {});
		this.saveHistory = context?.commands?.commit || saveHistory || (() => {});
		this.targetFromPoint = targetFromPoint || (() => null);
		this.targetFromMidpoint = targetFromMidpoint || (() => null);
	}

	isEditMode(activeTool = this.getActiveTool()) {
		return activeTool === 'select' || activeTool === this.id || activeTool === 'eraser';
	}

	handlePointDown(event, point, canvasInput) {
		if (!this.isEditMode()) return false;
		const target = this.targetFromPoint(point);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		event.stopPropagation?.();

		if (event.altKey || this.getActiveTool() === 'eraser') {
			if (!path.canRemovePoint()) return false;
			path.removePoint(point.index);
			this.saveHistory();
			return true;
		}

		this.startInteraction('move-point', { ...target, pointIndex: point.index });
		return true;
	}

	handleMidpointDown(event, midpoint, canvasInput) {
		if (!this.isEditMode()) return false;
		const target = this.targetFromMidpoint(midpoint);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		event.stopPropagation?.();
		path.insertPoint(midpoint.insertIndex, [midpoint.midX, midpoint.midY]);
		this.startInteraction('move-point', { ...target, pointIndex: midpoint.insertIndex });
		return true;
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
			.selectAll('circle.route-point-hit-area')
			.data(pointHandles, pointKey)
			.join('circle')
			.attr('class', `route-point-hit-area ${isErasing ? 'cursor-pointer' : 'cursor-move'}`)
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
			.selectAll('circle.route-point-handle')
			.data(pointHandles, pointKey)
			.join('circle')
			.attr('class', 'route-point-handle')
			.attr('cx', (item) => item.point[0] * baseWidth)
			.attr('cy', (item) => item.point[1] * baseHeight)
			.attr('r', (item) => item.handleSize)
			.attr('fill', isErasing ? '#fee2e2' : 'white')
			.attr('stroke', isErasing ? '#ef4444' : '#3b82f6')
			.attr('stroke-width', 2)
			.style('pointer-events', 'none');

		handlesLayer
			.selectAll('circle.route-midpoint-hit-area')
			.data(midpoints, midpointKey)
			.join('circle')
			.attr('class', 'route-midpoint-hit-area cursor-pointer')
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
			.selectAll('circle.route-midpoint')
			.data(midpoints, midpointKey)
			.join('circle')
			.attr('class', 'route-midpoint')
			.attr('cx', (item) => item.midX * baseWidth)
			.attr('cy', (item) => item.midY * baseHeight)
			.attr('r', (item) => item.midpointSize)
			.attr('fill', '#3b82f6')
			.attr('opacity', 0.6)
			.attr('stroke', 'white')
			.attr('stroke-width', 1)
			.style('pointer-events', 'none');
	}
}
