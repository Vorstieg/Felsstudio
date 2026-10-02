import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { CanvasInput } from '../2d/create-canvas-input.svelte.ts';
import type { EditablePath } from '../2d/editable-path.ts';
import type {
	EditablePathTarget,
	InteractionPoint,
	Topo2DInteraction,
	SelectionSnapshot
} from '$lib/state/topo-2d-editor-interactions.ts';
import type { Point2D } from '$lib/assets/js/path-geometry.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;

type EditControlPoint = {
	point: Point2D;
	hitSize: number;
	handleSize: number;
	index: number;
	routeId?: string | number;
	outlineId?: string | number;
	pitchId?: string | number | null;
	variantId?: string | number | null;
	selected?: boolean;
};
type EditMidpoint = {
	midX: number;
	midY: number;
	midpointHitSize: number;
	midpointSize: number;
	insertIndex: number;
	routeId?: string | number;
	outlineId?: string | number;
	pitchId?: string | number | null;
	variantId?: string | number | null;
};
type ControlHandler<T> = (event: MouseEvent, item: T, input: CanvasInput) => boolean;
export type EditablePathPointControl = {
	index: number;
	routeId?: string | number;
	outlineId?: string | number;
	pitchId?: string | number | null;
	variantId?: string | number | null;
};
export type EditablePathMidpointControl = Omit<EditablePathPointControl, 'index'> & {
	insertIndex: number;
	midX: number;
	midY: number;
};
type ControlArgs<P extends EditControlPoint, M extends EditMidpoint> = {
	layers: { handles: import('d3-selection').Selection<SVGGElement, unknown, null, undefined> };
	pointHandles: P[];
	midpoints: M[];
	pointKey: (item: P) => string;
	midpointKey: (item: M) => string;
	pointTarget: (item: P) => EditablePathPointControl;
	midpointTarget: (item: M) => EditablePathMidpointControl;
	canvasInput: CanvasInput;
	baseWidth: number;
	baseHeight: number;
	hideControlPoints?: boolean;
};

const DUPLICATE_PRESS_MS = 700;
const DUPLICATE_PRESS_TOPO_DISTANCE = 0.003;
const COMPAT_MOUSE_MS = 800;
const COMPAT_MOUSE_PX = 8;

/** Shared point and midpoint editing behavior for persisted editable paths. */
export class EditablePathEditTool {
	editor: Editor;
	id: string;
	getActiveTool: () => string;
	getEditablePath: (target: EditablePathTarget) => EditablePath | null;
	mutateDocument: (mutator: () => unknown) => unknown;
	startInteraction: (interaction: Topo2DInteraction) => void;
	saveHistory: () => void;
	isSelected: (type: string, id: string | number) => boolean;
	selectObject: (type: string, id: string | number, additive: boolean) => void;
	getIsShiftPressed: () => boolean;
	getMobileSelectionMode: () => boolean;
	beginSelectionMove: (point: InteractionPoint) => SelectionSnapshot | null;
	targetFromPoint: (point: EditablePathPointControl) => EditablePathTarget | null;
	targetFromMidpoint: (point: EditablePathMidpointControl) => EditablePathTarget | null;
	lastPointerControlEvent: { time: number; x: number; y: number } | null;
	lastEditPress: { scope: string; point: InteractionPoint; time: number } | null;
	constructor(
		editor: Editor,
		{
			id,
			getEditablePath,
			beginSelectionMove,
			targetFromPoint,
			targetFromMidpoint
		}: {
			id: string;
			getEditablePath?: (target: EditablePathTarget) => EditablePath | null;
			beginSelectionMove?: (point: InteractionPoint) => SelectionSnapshot | null;
			targetFromPoint?: (point: EditablePathPointControl) => EditablePathTarget | null;
			targetFromMidpoint?: (point: EditablePathMidpointControl) => EditablePathTarget | null;
		} = { id: 'editablePath' }
	) {
		this.editor = editor;
		this.id = id;
		this.getActiveTool = () => editor.ui.activeTool;
		this.getEditablePath = getEditablePath || (() => null);
		this.mutateDocument = (mutator) => editor.mutateDocument(mutator);
		this.startInteraction = (interaction) => editor.startInteraction(interaction);
		this.saveHistory = () => editor.saveHistory();
		this.isSelected = (type, id) =>
			editor.isSelected(type as Parameters<Editor['isSelected']>[0], id);
		this.selectObject = (type, id, additive) =>
			editor.selectObject(type as Parameters<Editor['selectObject']>[0], id, additive);
		this.getIsShiftPressed = () => editor.ui.isShiftPressed;
		this.getMobileSelectionMode = () => editor.ui.mobileSelectionMode;
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.targetFromPoint = targetFromPoint || (() => null);
		this.targetFromMidpoint = targetFromMidpoint || (() => null);
		this.lastPointerControlEvent = null;
		this.lastEditPress = null;
	}

	markPointerCompatibilityEvent(event: MouseEvent | PointerEvent | Touch) {
		this.lastPointerControlEvent = {
			time: Date.now(),
			x: event?.clientX,
			y: event?.clientY
		};
	}

	shouldIgnoreCompatibilityMouseEvent(event: MouseEvent | PointerEvent | Touch) {
		if (!('type' in event) || event.type !== 'mousedown') return false;
		const last = this.lastPointerControlEvent;
		if (!last || Date.now() - last.time > COMPAT_MOUSE_MS) return false;
		const dx = Number(event.clientX) - Number(last.x);
		const dy = Number(event.clientY) - Number(last.y);
		return Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) < COMPAT_MOUSE_PX;
	}

	getEventPoint(event: Event, canvasInput: CanvasInput) {
		return canvasInput?.normalizeEvent?.(event)?.point || null;
	}

	shouldIgnoreRapidRepeat(
		event: Event,
		canvasInput: CanvasInput,
		scope = 'edit',
		point: InteractionPoint | null = null
	) {
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

	markEditPress(scope: string, point: InteractionPoint | null) {
		if (point) this.lastEditPress = { scope, point, time: Date.now() };
	}

	isEditMode(activeTool = this.getActiveTool()) {
		return activeTool === 'select' || activeTool === this.id || activeTool === 'eraser';
	}

	handlePointDown(event: MouseEvent, point: EditablePathPointControl, _canvasInput: CanvasInput) {
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

		this.startInteraction({ kind: 'move-point', ...target, pointIndex: point.index });
		this.markEditPress('path-control', repeat.point);
		return true;
	}

	handleMidpointDown(
		event: MouseEvent,
		midpoint: EditablePathMidpointControl,
		_canvasInput: CanvasInput
	) {
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
		this.startInteraction({ kind: 'move-point', ...target, pointIndex: midpoint.insertIndex });
		this.markEditPress('path-control', repeat.point);
		return true;
	}

	/** Shared select, erase, and drag behavior for a rendered editable item. */
	handleItemDown(
		event: MouseEvent,
		item: {
			id?: string | number;
			pitchId?: string | number | null;
			variantId?: string | number | null;
		},
		canvasInput: CanvasInput,
		{
			type,
			getId = (value: { id?: string | number }) => value?.id,
			remove,
			beforeMove
		}: {
			type: string;
			getId?: (value: { id?: string | number }) => string | number | null | undefined;
			remove?: (ids: Array<string | number>) => boolean;
			beforeMove?: (
				item: {
					id?: string | number;
					pitchId?: string | number | null;
					variantId?: string | number | null;
				},
				id: string | number
			) => boolean | void;
		} = { type: 'path' }
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
		if ('identifier' in event && event.identifier != null && this.getMobileSelectionMode()) {
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
		const selection = this.beginSelectionMove(mouse);
		if (!selection) return false;
		this.startInteraction({ kind: 'move-selection', ...selection });
		this.markEditPress('item', mouse);
		return true;
	}

	handleTouchItemDown(
		event: TouchEvent,
		item: {
			id?: string | number;
			pitchId?: string | number | null;
			variantId?: string | number | null;
		},
		canvasInput: CanvasInput,
		options: Parameters<EditablePathEditTool['handleItemDown']>[3]
	) {
		return this.handleTouchControl(
			event,
			(touchEvent) => this.handleItemDown(touchEvent, item, canvasInput, options),
			item,
			canvasInput
		);
	}

	handleTouchControl<T>(
		event: TouchEvent,
		handler: ControlHandler<T>,
		item: T,
		canvasInput: CanvasInput
	) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		const touch = event.touches[0];
		canvasInput.trackTouch?.(touch);
		const handled = handler.call(this, touch as unknown as MouseEvent, item, canvasInput);
		if (handled) this.markPointerCompatibilityEvent(touch);
		return handled;
	}

	handlePointerControl<T>(
		event: PointerEvent,
		handler: ControlHandler<T>,
		item: T,
		canvasInput: CanvasInput
	) {
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
	}: ControlArgs<EditControlPoint, EditMidpoint>) {
		const handlesLayer = layers.handles
			.selectAll(`g.${this.id}-controls`)
			.data([null])
			.join('g')
			.attr('class', `editable-path-controls ${this.id}-controls`);
		const isErasing = this.getActiveTool() === 'eraser';

		handlesLayer
			.selectAll<SVGCircleElement, EditControlPoint>('circle.editable-path-point-hit-area')
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
			.selectAll<SVGCircleElement, EditControlPoint>('circle.editable-path-point-handle')
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
			.selectAll<SVGCircleElement, EditMidpoint>('circle.editable-path-midpoint-hit-area')
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
			.selectAll<SVGCircleElement, EditMidpoint>('circle.editable-path-midpoint')
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
