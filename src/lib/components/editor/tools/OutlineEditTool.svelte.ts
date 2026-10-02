import { EditablePathEditTool } from './EditablePathEditTool.svelte.ts';
import type { CanvasInput } from '../2d/create-canvas-input.svelte.ts';
import type { OutlineRecord, OutlineCanvasSize } from '$lib/assets/js/outline-geometry.ts';
import type {
	EditablePathTarget,
	InteractionId,
	InteractionPoint,
	SelectionSnapshot,
	Topo2DInteraction
} from '$lib/state/topo-2d-editor-interactions.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { EditablePath } from '../2d/editable-path.ts';
import type { Topo2DRenderModel } from '../2d/topo-2d-render-model.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type SemanticHandle = Topo2DRenderModel['outlines']['semanticHandles'][number];

type Layers = { handles: import('d3-selection').Selection<SVGGElement, unknown, null, undefined> };
type SemanticInteraction = Extract<Topo2DInteraction, { kind: 'transform-preset-outline' }>;
import {
	applyPresetSemanticHandleDrag,
	DEFAULT_OUTLINE_CURVE_TENSION,
	getOutlinePoints,
	isClosedShape,
	simplifyClosedPoints,
	simplifyPoints
} from '$lib/assets/js/outline-geometry.ts';
import { snapPointToGrid } from './path-drawing-logic.ts';

/** Editing interactions for persisted 2D rock outlines. */
export class OutlineEditTool extends EditablePathEditTool {
	snapToGrid = $state(false);
	gridSize = $state(0.01);
	getTopo: () => Editor['topo'];
	getCanvasSize: () => OutlineCanvasSize;
	updateOutline: Editor['updateOutline'];
	deleteOutlines: Editor['deleteOutlines'];

	constructor(
		editor: Editor,
		{
			getCanvasSize,
			getEditablePath,
			beginSelectionMove
		}: {
			getCanvasSize?: () => OutlineCanvasSize;
			getEditablePath?: (target: EditablePathTarget) => EditablePath | null;
			beginSelectionMove?: (mouse: InteractionPoint) => SelectionSnapshot | null;
		} = {}
	) {
		super(editor, {
			id: 'outlineEdit',
			getEditablePath,
			beginSelectionMove,
			targetFromPoint: ({ outlineId }) => (outlineId == null ? null : { outlineId }),
			targetFromMidpoint: ({ outlineId }) => (outlineId == null ? null : { outlineId })
		});
		this.getTopo = () => editor.topo;
		this.getCanvasSize = getCanvasSize || (() => editor.viewport);
		this.updateOutline = (...args) => editor.updateOutline(...args);
		this.deleteOutlines = (...args) => editor.deleteOutlines(...args);
	}

	getOutline(id: InteractionId): OutlineRecord | null {
		return this.getTopo().outlines.find((outline) => String(outline.id) === String(id)) || null;
	}

	updateCurve(id: InteractionId, changes: Partial<NonNullable<OutlineRecord['curve']>>) {
		const outline = this.getOutline(id);
		if (!outline) return false;
		const curve = {
			enabled: false,
			tension: DEFAULT_OUTLINE_CURVE_TENSION,
			...(outline.curve || {}),
			...changes
		};
		this.updateOutline(outline.id, { curve }, { recordHistory: false });
		this.saveHistory();
		return true;
	}

	updateProperties(id: InteractionId, changes: Partial<OutlineRecord>) {
		const outline = this.getOutline(id);
		if (!outline) return false;
		this.updateOutline(outline.id, changes, { recordHistory: false });
		this.saveHistory();
		return true;
	}

	snapPoint(point: InteractionPoint) {
		return snapPointToGrid(point, { enabled: this.snapToGrid, gridSize: this.gridSize }) || point;
	}

	delete(ids: InteractionId[]) {
		return this.deleteOutlines(ids, { recordHistory: false });
	}

	simplifyOutline(id: InteractionId, tolerancePx: number) {
		const outline = this.getOutline(id);
		const tolerance = Number(tolerancePx);
		if (!outline || !Number.isFinite(tolerance) || tolerance <= 0) return null;

		const points = getOutlinePoints(outline, this.getCanvasSize());
		if (points.length <= 2) return null;
		const simplified = isClosedShape(points)
			? simplifyClosedPoints(points, tolerance, this.getCanvasSize())
			: simplifyPoints(points, tolerance, this.getCanvasSize());
		if (simplified.length >= points.length || simplified.length < (isClosedShape(points) ? 4 : 2)) {
			return { changed: false, pointCount: points.length, tolerance };
		}

		// Keep freehand/brush metadata (including edge tracking), but make the
		// simplified vertices authoritative for both rendering and export.
		const changes = {
			shape: { ...(outline.shape || { type: 'polyline' }), points2D: simplified },
			points2D: simplified,
			closed: isClosedShape(simplified)
		};
		this.updateOutline(outline.id, changes, { recordHistory: false });
		this.saveHistory();
		return {
			changed: true,
			previousPointCount: points.length,
			pointCount: simplified.length,
			tolerance
		};
	}

	createSemanticInteraction(
		handle: SemanticHandle,
		mouse: InteractionPoint
	): SemanticInteraction | null {
		const outline = this.getOutline(handle.outlineId);
		if (!outline?.shape?.preset) return null;
		return {
			kind: 'transform-preset-outline',
			outlineId: outline.id,
			handleId: handle.id,
			startMouse: [mouse.x, mouse.y],
			// Svelte state objects may be proxies; JSON cloning produces a plain
			// snapshot that can safely be reused for every drag frame.
			outlineSnapshot: JSON.parse(JSON.stringify(outline))
		};
	}

	handleSemanticHandleDown(event: MouseEvent, handle: SemanticHandle, canvasInput: CanvasInput) {
		if (this.shouldIgnoreCompatibilityMouseEvent(event)) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		if (!this.isSemanticEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		event.preventDefault?.();
		event.stopPropagation?.();
		const interaction = this.createSemanticInteraction(handle, mouse);
		if (!interaction) return false;
		this.startInteraction(interaction);
		return true;
	}

	handleSemanticHandleTouch(event: TouchEvent, handle: SemanticHandle, canvasInput: CanvasInput) {
		return this.handleTouchControl(event, this.handleSemanticHandleDown, handle, canvasInput);
	}

	handleSemanticHandlePointer(
		event: PointerEvent,
		handle: SemanticHandle,
		canvasInput: CanvasInput
	) {
		if (event.pointerType !== 'pen' && event.pointerType !== 'touch') return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackPointer?.(event);
		const handled = this.handleSemanticHandleDown(event, handle, canvasInput);
		if (handled) this.markPointerCompatibilityEvent(event);
		return handled;
	}

	applySemanticTransform(interaction: SemanticInteraction, mouse: InteractionPoint) {
		const outline = this.getOutline(interaction.outlineId);
		if (!outline) return false;
		const changes = applyPresetSemanticHandleDrag(
			interaction.outlineSnapshot || outline,
			String(interaction.handleId),
			interaction.startMouse,
			[mouse.x, mouse.y],
			this.getCanvasSize()
		);
		this.updateOutline(outline.id, changes, { recordHistory: false });
		return true;
	}

	handleOutlineDown(event: MouseEvent, outline: OutlineRecord, canvasInput: CanvasInput) {
		return this.handleItemDown(event, outline, canvasInput, {
			type: 'outline',
			remove: (ids) => this.delete(ids)
		});
	}

	handleTouchOutlineDown(event: TouchEvent, outline: OutlineRecord, canvasInput: CanvasInput) {
		return this.handleTouchItemDown(event, outline, canvasInput, {
			type: 'outline',
			remove: (ids) => this.delete(ids)
		});
	}

	render({
		layers,
		renderModel,
		baseWidth,
		baseHeight,
		canvasInput,
		hideControlPoints
	}: {
		layers: Layers;
		renderModel: Topo2DRenderModel;
		baseWidth: number;
		baseHeight: number;
		canvasInput: CanvasInput;
		hideControlPoints?: boolean;
	}) {
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
			baseHeight,
			hideControlPoints
		});
		this.renderSemanticHandles({
			layers,
			handles: renderModel.outlines.semanticHandles,
			baseWidth,
			baseHeight,
			canvasInput,
			hideControlPoints
		});
	}

	renderSemanticHandles({
		layers,
		handles,
		baseWidth,
		baseHeight,
		canvasInput,
		hideControlPoints
	}: {
		layers: Layers;
		handles: SemanticHandle[];
		baseWidth: number;
		baseHeight: number;
		canvasInput: CanvasInput;
		hideControlPoints?: boolean;
	}) {
		const layer = layers.handles
			.selectAll('g.outline-semantic-controls')
			.data([null])
			.join('g')
			.attr('class', 'outline-semantic-controls');
		const active = this.isSemanticEditMode();
		const displayPoint = (item: SemanticHandle) => {
			// Pillar/slab height and lean originate at the same logical anchor.
			// Offset them visually so both controls remain reachable.
			if (item.kind === 'lean') return [item.point[0], item.point[1] + 10 / baseHeight];
			if (item.kind === 'scale-height') return [item.point[0] - 10 / baseWidth, item.point[1]];
			return item.point;
		};

		layer
			.selectAll<SVGCircleElement, SemanticHandle>('circle.outline-semantic-hit-area')
			.data(handles, (item) => `${item.outlineId}-${item.id}`)
			.join('circle')
			.attr('class', 'outline-semantic-hit-area cursor-pointer')
			.attr('cx', (item) => displayPoint(item)[0] * baseWidth)
			.attr('cy', (item) => displayPoint(item)[1] * baseHeight)
			.attr('r', (item) => item.hitSize)
			.attr('fill', 'transparent')
			.style('pointer-events', active ? 'all' : 'none')
			.style('touch-action', 'none')
			.on('mousedown', (event, item) => this.handleSemanticHandleDown(event, item, canvasInput))
			.on('touchstart', (event, item) => this.handleSemanticHandleTouch(event, item, canvasInput))
			.on('pointerdown', (event, item) =>
				this.handleSemanticHandlePointer(event, item, canvasInput)
			);

		layer
			.selectAll<SVGCircleElement, SemanticHandle>('circle.outline-semantic-handle')
			.data(hideControlPoints ? [] : handles, (item) => `${item.outlineId}-${item.id}`)
			.join('circle')
			.attr('class', (item) => `outline-semantic-handle ${item.kind}`)
			.attr('cx', (item) => displayPoint(item)[0] * baseWidth)
			.attr('cy', (item) => displayPoint(item)[1] * baseHeight)
			.attr('r', (item) => item.handleSize)
			.attr('fill', (item) => (item.kind.startsWith('scale') ? '#3b82f6' : '#f59e0b'))
			.attr('stroke', 'white')
			.attr('stroke-width', 2)
			.style('pointer-events', 'none');
	}

	isSemanticEditMode() {
		return ['select', this.id].includes(this.getActiveTool());
	}

	onMouseDown() {}
	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}
