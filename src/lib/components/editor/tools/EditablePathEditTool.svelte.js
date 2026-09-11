const DUPLICATE_PRESS_MS = 700;
const DUPLICATE_PRESS_TOPO_DISTANCE = 0.003;
const COMPAT_MOUSE_MS = 800;
const COMPAT_MOUSE_PX = 8;

/** Shared point and midpoint editing behavior for persisted editable paths. */
export class EditablePathEditTool {
	constructor(
		editor,
		{ id, getEditablePath, beginSelectionMove, targetFromPoint, targetFromMidpoint } = {}
	) {
		this.editor = editor;
		this.id = id;
		this.getActiveTool = () => editor.ui.activeTool;
		this.getEditablePath = getEditablePath || (() => null);
		this.mutateDocument = (mutator) => editor.mutateDocument(mutator);
		this.startInteraction = (...args) => editor.startInteraction(...args);
		this.saveHistory = () => editor.saveHistory();
		this.isSelected = (...args) => editor.isSelected(...args);
		this.selectObject = (...args) => editor.selectObject(...args);
		this.getIsShiftPressed = () => editor.ui.isShiftPressed;
		this.getMobileSelectionMode = () => editor.ui.mobileSelectionMode;
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.targetFromPoint = targetFromPoint || (() => null);
		this.targetFromMidpoint = targetFromMidpoint || (() => null);
		this.lastPointerControlEvent = null;
		this.lastEditPress = null;
	}

	markPointerCompatibilityEvent(event) {
		this.lastPointerControlEvent = {
			time: Date.now(),
			x: event?.clientX,
			y: event?.clientY
		};
	}

	shouldIgnoreCompatibilityMouseEvent(event) {
		if (event?.type !== 'mousedown') return false;
		const last = this.lastPointerControlEvent;
		if (!last || Date.now() - last.time > COMPAT_MOUSE_MS) return false;
		const dx = Number(event.clientX) - Number(last.x);
		const dy = Number(event.clientY) - Number(last.y);
		return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) < COMPAT_MOUSE_PX;
	}

	getEventPoint(event, canvasInput) {
		return canvasInput?.normalizeEvent?.(event)?.point || null;
	}

	shouldIgnoreRapidRepeat(event, canvasInput, scope = 'edit', point = null) {
		const eventPoint = point || this.getEventPoint(event, canvasInput);
		if (!eventPoint) return { ignore: false, point: eventPoint };
		const last = this.lastEditPress;
		if (!last || Date.now() - last.time > DUPLICATE_PRESS_MS || last.scope !== scope) {
			return { ignore: false, point: eventPoint };
		}
		return {
			ignore:
				Math.hypot(eventPoint.x - last.point.x, eventPoint.y - last.point.y) <
				DUPLICATE_PRESS_TOPO_DISTANCE,
			point: eventPoint
		};
	}

	markEditPress(scope, point) {
		if (point) this.lastEditPress = { scope, point, time: Date.now() };
	}

	isEditMode(activeTool = this.getActiveTool()) {
		return activeTool === 'select' || activeTool === this.id || activeTool === 'eraser';
	}

	handlePointDown(event, point, _canvasInput) {
		if (this.shouldIgnoreCompatibilityMouseEvent(event)) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		if (!this.isEditMode()) return false;
		const target = this.targetFromPoint(point);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		const repeat = this.shouldIgnoreRapidRepeat(event, _canvasInput, 'path-control');
		if (repeat.ignore) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		event.stopPropagation?.();

		if (event.altKey || this.getActiveTool() === 'eraser') {
			if (!path.canRemovePoint()) return false;
			this.mutateDocument(() => path.removePoint(point.index));
			this.markEditPress('path-control', repeat.point);
			this.saveHistory();
			return true;
		}

		this.startInteraction('move-point', { ...target, pointIndex: point.index });
		this.markEditPress('path-control', repeat.point);
		return true;
	}

	handleMidpointDown(event, midpoint, _canvasInput) {
		if (this.shouldIgnoreCompatibilityMouseEvent(event)) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		if (!this.isEditMode()) return false;
		const target = this.targetFromMidpoint(midpoint);
		const path = target && this.getEditablePath(target);
		if (!path) return false;
		const repeat = this.shouldIgnoreRapidRepeat(event, _canvasInput, 'path-control');
		if (repeat.ignore) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		event.stopPropagation?.();
		this.mutateDocument(() =>
			path.insertPoint(midpoint.insertIndex, [midpoint.midX, midpoint.midY])
		);
		this.startInteraction('move-point', { ...target, pointIndex: midpoint.insertIndex });
		this.markEditPress('path-control', repeat.point);
		return true;
	}

	/** Shared select, erase, and drag behavior for a rendered editable item. */
	handleItemDown(
		event,
		item,
		canvasInput,
		{ type, getId = (value) => value?.id, remove, beforeMove } = {}
	) {
		if (this.shouldIgnoreCompatibilityMouseEvent(event)) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		if (!this.isEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		const repeat = this.shouldIgnoreRapidRepeat(event, canvasInput, 'item', mouse);
		if (repeat.ignore) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		event.stopPropagation?.();

		const id = getId(item);
		if (id == null) return false;
		if (this.getActiveTool() === 'eraser') {
			if (remove?.([id])) this.saveHistory();
			this.markEditPress('item', mouse);
			return true;
		}
		if (event?.identifier != null && this.getMobileSelectionMode()) {
			this.selectObject(type, id, true);
			this.markEditPress('item', mouse);
			return true;
		}
		if (this.getIsShiftPressed()) {
			this.selectObject(type, id, true);
			this.markEditPress('item', mouse);
			return true;
		}

		const shouldSelect = beforeMove?.(item, id) !== false;
		if (shouldSelect && !this.isSelected(type, id)) {
			this.selectObject(type, id, false);
		}
		this.startInteraction('move-selection', this.beginSelectionMove(mouse));
		this.markEditPress('item', mouse);
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
		const touch = event.touches[0];
		canvasInput.trackTouch(touch);
		const handled = handler.call(this, touch, item, canvasInput);
		if (handled) this.markPointerCompatibilityEvent(touch);
		return handled;
	}

	handlePointerControl(event, handler, item, canvasInput) {
		if (event.pointerType !== 'pen') return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackPointer?.(event);
		const handled = handler.call(this, event, item, canvasInput);
		if (handled) this.markPointerCompatibilityEvent(event);
		return handled;
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
		baseHeight,
		hideControlPoints = false
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
			.on('pointerdown', (event, item) =>
				this.handlePointerControl(event, this.handlePointDown, pointTarget(item), canvasInput)
			)
			.on('click', (event) => event.stopPropagation());

		handlesLayer
			.selectAll('circle.editable-path-point-handle')
			.data(hideControlPoints ? [] : pointHandles, pointKey)
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
			)
			.on('pointerdown', (event, item) =>
				this.handlePointerControl(event, this.handleMidpointDown, midpointTarget(item), canvasInput)
			);

		handlesLayer
			.selectAll('circle.editable-path-midpoint')
			.data(hideControlPoints ? [] : midpoints, midpointKey)
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
