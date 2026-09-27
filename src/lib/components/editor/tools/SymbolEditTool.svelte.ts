import { select } from 'd3-selection';
import { topoSymbols } from '@vorstieg/topo-renderer';
import type { FixPoint } from '@vorstieg/fels-types/types';
import type { CanvasInput } from '../2d/create-canvas-input.svelte.ts';
import type { Selection, BaseType } from 'd3-selection';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type {
	InteractionId,
	InteractionPoint,
	Topo2DInteraction
} from '$lib/state/topo-2d-editor-interactions.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type CanvasSize = Pick<Editor['viewport'], 'baseWidth' | 'baseHeight'>;
type SymbolWithPosition = FixPoint & { position2D: [number, number] };
type SymbolAction = 'move' | 'rotate' | 'scale' | 'scale-x' | 'scale-y';
type PointerLike = (MouseEvent | TouchEvent | Touch) & { identifier?: number };
type SymbolGroups = Selection<SVGGElement, FixPoint, BaseType, unknown>;
const hasPosition = (symbol: FixPoint | null): symbol is SymbolWithPosition =>
	Array.isArray(symbol?.position2D);
const scaleValue = (value: unknown): number => (typeof value === 'number' ? value : 1);

/** Editing and transform controls for existing 2D symbols. */
export class SymbolEditTool {
	id = 'symbolEdit';
	getTopo: () => Editor['topo'];
	mutateDocument: Editor['mutateDocument'];
	getCanvasSize: () => CanvasSize;
	getInteraction: () => Topo2DInteraction | null;
	startInteraction: Editor['startInteraction'];
	isSelected: Editor['isSelected'];
	selectObject: Editor['selectObject'];
	getSelectionSize: () => number;
	getIsShiftPressed: () => boolean;
	getMobileSelectionMode: () => boolean;
	beginSelectionMove: (mouse: InteractionPoint) => Topo2DInteraction | null;
	getSelectedSymbolId: () => InteractionId | null;
	saveHistory: Editor['saveHistory'];
	deleteSymbols: Editor['deleteSymbols'];

	constructor(
		editor: Editor,
		{
			getCanvasSize,
			beginSelectionMove
		}: {
			getCanvasSize?: () => CanvasSize;
			beginSelectionMove?: (mouse: InteractionPoint) => Topo2DInteraction | null;
		} = {}
	) {
		this.getTopo = () => editor.topo;
		this.mutateDocument = (mutator) => editor.mutateDocument(mutator);
		this.getCanvasSize = getCanvasSize || (() => editor.viewport);
		this.getInteraction = () => editor.interaction;
		this.startInteraction = (...args) => editor.startInteraction(...args);
		this.isSelected = (...args) => editor.isSelected(...args);
		this.selectObject = (...args) => editor.selectObject(...args);
		this.getSelectionSize = () => editor.selectedItems.size;
		this.getIsShiftPressed = () => editor.ui.isShiftPressed;
		this.getMobileSelectionMode = () => editor.ui.mobileSelectionMode;
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.getSelectedSymbolId = () => editor.selectedId('symbol');
		this.saveHistory = () => editor.saveHistory();
		this.deleteSymbols = (...args) => editor.deleteSymbols(...args);
	}

	getSymbol(id: InteractionId | null): FixPoint | null {
		return this.getTopo().fixPoints.find((symbol) => symbol.id === id) || null;
	}

	getPointerDelta(symbol: SymbolWithPosition, mouse: InteractionPoint) {
		const { baseWidth = 1, baseHeight = 1 } = this.getCanvasSize();
		return {
			x: (mouse.x - symbol.position2D[0]) * baseWidth,
			y: (mouse.y - symbol.position2D[1]) * baseHeight
		};
	}

	getLocalPointerDelta(symbol: SymbolWithPosition, mouse: InteractionPoint) {
		const { x: dx, y: dy } = this.getPointerDelta(symbol, mouse);
		const angle = -((symbol.rotation2D || 0) * Math.PI) / 180;
		return {
			x: dx * Math.cos(angle) - dy * Math.sin(angle),
			y: dx * Math.sin(angle) + dy * Math.cos(angle)
		};
	}

	createMoveInteraction(symbol: FixPoint, mouse: InteractionPoint): Topo2DInteraction | null {
		if (!hasPosition(symbol)) return null;
		return {
			kind: 'move-symbol',
			id: symbol.id,
			startMouse: mouse,
			startPosition: [symbol.position2D[0], symbol.position2D[1]]
		};
	}

	createRotateInteraction(symbol: FixPoint): Topo2DInteraction | null {
		return hasPosition(symbol) ? { kind: 'rotate-symbol', id: symbol.id } : null;
	}

	createScaleInteraction(
		symbol: FixPoint,
		mouse: InteractionPoint,
		axis: 'x' | 'y' | null = null
	): Topo2DInteraction | null {
		if (!hasPosition(symbol)) return null;
		const { x: dx, y: dy } = this.getLocalPointerDelta(symbol, mouse);
		return {
			kind: axis ? `scale-symbol-${axis}` : 'scale-symbol',
			id: symbol.id,
			axis,
			startDist: axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy),
			startScale:
				axis === 'x'
					? scaleValue(symbol.scaleX2D)
					: axis === 'y'
						? scaleValue(symbol.scaleY2D)
						: scaleValue(symbol.scale2D)
		};
	}

	onMouseDown(
		event: PointerLike,
		mouse: InteractionPoint,
		{ symbolId, action = 'move' }: { symbolId: InteractionId; action?: SymbolAction }
	) {
		const symbol = this.getSymbol(symbolId);
		if (!symbol) return false;
		if ('stopPropagation' in event) event.stopPropagation();

		let interaction;
		if (action === 'rotate') interaction = this.createRotateInteraction(symbol);
		else if (action === 'scale') interaction = this.createScaleInteraction(symbol, mouse);
		else if (action === 'scale-x') interaction = this.createScaleInteraction(symbol, mouse, 'x');
		else if (action === 'scale-y') interaction = this.createScaleInteraction(symbol, mouse, 'y');
		else {
			if ('identifier' in event && event.identifier != null && this.getMobileSelectionMode()) {
				this.selectObject('symbol', symbolId, true);
				return true;
			}
			if (this.getIsShiftPressed()) {
				this.selectObject('symbol', symbolId, true);
				return true;
			}
			if (!this.isSelected('symbol', symbolId)) {
				this.selectObject('symbol', symbolId, this.getIsShiftPressed());
			}
			interaction =
				this.getSelectionSize() === 1
					? this.createMoveInteraction(symbol, mouse)
					: this.beginSelectionMove(mouse);
		}

		if (!interaction) return false;
		this.startInteraction(interaction);
		return true;
	}

	handlePointerDown(
		event: MouseEvent | TouchEvent,
		symbolId: InteractionId,
		action: SymbolAction,
		canvasInput: CanvasInput,
		touch: Touch | null = null
	) {
		const mouse = canvasInput.normalizeEvent(event, touch)?.point;
		if (!mouse) return false;
		return this.onMouseDown(touch ?? event, mouse, { symbolId, action });
	}

	handleTouchStart(
		event: TouchEvent,
		symbolId: InteractionId,
		action: SymbolAction,
		canvasInput: CanvasInput
	) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackTouch(event.touches[0]);
		return this.handlePointerDown(event, symbolId, action, canvasInput, event.touches[0]);
	}

	onMouseMove(_event: Event, mouse: InteractionPoint) {
		const interaction = this.getInteraction();
		if (
			!interaction ||
			!(
				interaction.kind === 'move-symbol' ||
				interaction.kind === 'rotate-symbol' ||
				interaction.kind === 'scale-symbol' ||
				interaction.kind === 'scale-symbol-x' ||
				interaction.kind === 'scale-symbol-y'
			)
		)
			return false;

		const symbol = this.getSymbol(interaction.id);
		if (!hasPosition(symbol)) return false;
		if (interaction.kind === 'move-symbol') {
			this.mutateDocument(() => {
				symbol.position2D = [
					interaction.startPosition[0] + mouse.x - interaction.startMouse.x,
					interaction.startPosition[1] + mouse.y - interaction.startMouse.y
				];
			});
			return true;
		}

		if (interaction.kind === 'rotate-symbol') {
			const { x: dx, y: dy } = this.getPointerDelta(symbol, mouse);
			this.mutateDocument(() => {
				symbol.rotation2D = (Math.atan2(dy, dx) * (180 / Math.PI) + 90) % 360;
			});
			return true;
		}
		const { x: dx, y: dy } = this.getLocalPointerDelta(symbol, mouse);
		if (interaction.startDist > 0) {
			const distance =
				interaction.axis === 'x'
					? Math.abs(dx)
					: interaction.axis === 'y'
						? Math.abs(dy)
						: Math.hypot(dx, dy);
			const value = Math.max(
				0.2,
				Math.min(5, interaction.startScale * (distance / interaction.startDist))
			);
			this.mutateDocument(() => {
				if (interaction.axis === 'x') symbol.scaleX2D = value;
				else if (interaction.axis === 'y') symbol.scaleY2D = value;
				else symbol.scale2D = value;
			});
			return true;
		}
		return false;
	}

	onMouseUp() {}
	onActivate() {}
	onDeactivate() {}

	onKeyDown(event: KeyboardEvent) {
		const id = this.getSelectedSymbolId();
		const delta =
			event.key === '+' || event.key === '='
				? 0.1
				: event.key === '-' || event.key === '_'
					? -0.1
					: 0;
		if (!delta || !this.scale(id, delta)) return false;
		event.preventDefault();
		this.saveHistory();
		return true;
	}

	scale(id: InteractionId | null, delta: number) {
		const symbol = this.getSymbol(id);
		if (!symbol) return false;
		this.mutateDocument(() => {
			symbol.scale2D = Math.max(0.2, Math.min(5, (symbol.scale2D || 1) + delta));
		});
		return true;
	}

	delete(ids: InteractionId[]) {
		return this.deleteSymbols(ids, { recordHistory: false });
	}

	/** Renders only the controls belonging to symbol editing, over existing symbol groups. */
	render({
		symbolGroups,
		activeTool,
		selectedSymbolInstance,
		canvasInput
	}: {
		symbolGroups: SymbolGroups;
		activeTool: string;
		selectedSymbolInstance: FixPoint | null;
		canvasInput: CanvasInput;
	}) {
		symbolGroups.each((symbol, index, nodes) => {
			const group = select(nodes[index]);
			const selected =
				selectedSymbolInstance?.id === symbol.id || this.isSelected('symbol', symbol.id);
			const meta = topoSymbols.find((item) => item.id === symbol.type);
			const baseWidth = meta?.width || 24;
			const baseHeight = meta?.height || 24;
			const scale = symbol.scale2D || 1;
			const scaleX = scale * Number(symbol.scaleX2D || 1);
			const scaleY = scale * Number(symbol.scaleY2D || 1);
			// Selection is the regular way to edit a symbol in the 2D editor.
			const showTransformControls = selected && (activeTool === this.id || activeTool === 'select');
			const boxPadding = 5;
			const boxX = -((baseWidth * scaleX) / 2 + boxPadding);
			const boxY = -((baseHeight * scaleY) / 2 + boxPadding);
			const boxWidth = baseWidth * scaleX + boxPadding * 2;
			const boxHeight = baseHeight * scaleY + boxPadding * 2;
			const gizmoSize = 3;
			const controlStroke = 2;

			group
				.selectAll('rect.bounding-box')
				.data(showTransformControls ? [symbol] : [])
				.join('rect')
				.attr('class', 'bounding-box')
				.attr('fill', 'none')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '2,2')
				.attr('x', boxX)
				.attr('y', boxY)
				.attr('width', boxWidth)
				.attr('height', boxHeight);

			group
				.selectAll('line.rotation-stalk')
				.data(showTransformControls ? [symbol] : [])
				.join('line')
				.attr('class', 'rotation-stalk')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 1)
				.attr('x1', 0)
				.attr('y1', boxY)
				.attr('x2', 0)
				.attr('y2', boxY - 20);

			group
				.selectAll('circle.rotate-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo rotate-gizmo cursor-alias')
				.attr('fill', '#f59e0b')
				.attr('stroke', 'white')
				.attr('cx', 0)
				.attr('cy', boxY - 20)
				.attr('r', gizmoSize)
				.attr('stroke-width', controlStroke)
				.on('mousedown', (event, item) =>
					this.handlePointerDown(event, item.id, 'rotate', canvasInput)
				)
				.on('touchstart', (event, item) =>
					this.handleTouchStart(event, item.id, 'rotate', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('circle.scale-x-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo scale-x-gizmo cursor-ew-resize')
				.attr('fill', '#3b82f6')
				.attr('stroke', 'white')
				.attr('cx', boxX + boxWidth)
				.attr('cy', 0)
				.attr('r', gizmoSize)
				.attr('stroke-width', controlStroke)
				.on('mousedown', (event, item) =>
					this.handlePointerDown(event, item.id, 'scale-x', canvasInput)
				)
				.on('touchstart', (event, item) =>
					this.handleTouchStart(event, item.id, 'scale-x', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('circle.scale-y-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo scale-y-gizmo cursor-ns-resize')
				.attr('fill', '#3b82f6')
				.attr('stroke', 'white')
				.attr('cx', 0)
				.attr('cy', boxY + boxHeight)
				.attr('r', gizmoSize)
				.attr('stroke-width', controlStroke)
				.on('mousedown', (event, item) =>
					this.handlePointerDown(event, item.id, 'scale-y', canvasInput)
				)
				.on('touchstart', (event, item) =>
					this.handleTouchStart(event, item.id, 'scale-y', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('circle.scale-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo scale-gizmo cursor-nwse-resize')
				.attr('fill', '#3b82f6')
				.attr('stroke', 'white')
				.attr('cx', boxX + boxWidth)
				.attr('cy', boxY + boxHeight)
				.attr('r', gizmoSize)
				.attr('stroke-width', controlStroke)
				.on('mousedown', (event, item) =>
					this.handlePointerDown(event, item.id, 'scale', canvasInput)
				)
				.on('touchstart', (event, item) =>
					this.handleTouchStart(event, item.id, 'scale', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('ellipse.selection-circle')
				.data(selected ? [symbol] : [])
				.join('ellipse')
				.attr('class', 'selection-circle')
				.attr('fill', 'none')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 2)
				.attr('stroke-dasharray', '4')
				.attr('cx', 0)
				.attr('cy', 0)
				.attr('rx', (baseWidth * scaleX) / 2 + 10)
				.attr('ry', (baseHeight * scaleY) / 2 + 10);
		});
	}
}
