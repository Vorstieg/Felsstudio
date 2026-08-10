import { EditablePathEditTool } from './EditablePathEditTool.svelte.js';
import {
	applyPresetSemanticHandle,
	getOutlinePoints,
	isClosedShape,
	simplifyClosedPoints,
	simplifyPoints
} from '$lib/assets/js/outline-geometry.js';

/** Editing interactions for persisted 2D rock outlines. */
export class OutlineEditTool extends EditablePathEditTool {
	snapToGrid = $state(false);
	gridSize = $state(0.01);

	constructor({
		context,
		getTopo,
		getCanvasSize,
		getActiveTool,
		getEditablePath,
		startInteraction,
		saveHistory,
		isSelected,
		selectObject,
		getIsShiftPressed,
		getMobileSelectionMode,
		beginSelectionMove
	} = {}) {
		super({
			context,
			id: 'outlineEdit',
			getActiveTool,
			getEditablePath,
			startInteraction: context?.selection?.startInteraction || startInteraction,
			saveHistory: context?.history?.save || saveHistory,
			isSelected,
			selectObject,
			getIsShiftPressed,
			getMobileSelectionMode,
			beginSelectionMove,
			targetFromPoint: ({ outlineId }) => ({ outlineId }),
			targetFromMidpoint: ({ outlineId }) => ({ outlineId })
		});
		this.getTopo = getTopo || (() => ({ outlines: [] }));
		this.getCanvasSize =
			context?.viewport?.getCanvasSize ||
			getCanvasSize ||
			(() => ({ baseWidth: 1, baseHeight: 1 }));
		this.updateOutline = context?.commands?.updateOutline || null;
		this.deleteOutlines = context?.commands?.deleteOutlines || null;
	}

	getOutline(id) {
		return this.getTopo().outlines.find((outline) => String(outline.id) === String(id)) || null;
	}

	snapPoint(point) {
		if (!this.snapToGrid || !Number.isFinite(Number(this.gridSize)) || Number(this.gridSize) <= 0) {
			return point;
		}
		const size = Number(this.gridSize);
		return {
			x: Math.round(point.x / size) * size,
			y: Math.round(point.y / size) * size
		};
	}

	delete(ids) {
		if (this.deleteOutlines) return this.deleteOutlines(ids, { recordHistory: false });
		const idsToDelete = new Set(ids.map(String));
		const topo = this.getTopo();
		const before = topo.outlines.length;
		topo.outlines = topo.outlines.filter((outline) => !idsToDelete.has(String(outline.id)));
		return topo.outlines.length !== before;
	}

	simplifyOutline(id, tolerancePx) {
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
		if (this.updateOutline) this.updateOutline(outline.id, changes, { recordHistory: false });
		else Object.assign(outline, changes);
		this.saveHistory();
		return {
			changed: true,
			previousPointCount: points.length,
			pointCount: simplified.length,
			tolerance
		};
	}

	createSemanticInteraction(handle) {
		const outline = this.getOutline(handle.outlineId);
		if (!outline?.shape?.preset) return null;
		return {
			kind: 'transform-preset-outline',
			outlineId: outline.id,
			handleId: handle.id
		};
	}

	handleSemanticHandleDown(event, handle, canvasInput) {
		if (!this.isSemanticEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		event.preventDefault?.();
		event.stopPropagation?.();
		const interaction = this.createSemanticInteraction(handle);
		if (!interaction) return false;
		this.startInteraction(interaction.kind, interaction);
		return true;
	}

	handleSemanticHandleTouch(event, handle, canvasInput) {
		return this.handleTouchControl(event, this.handleSemanticHandleDown, handle, canvasInput);
	}

	applySemanticTransform(interaction, mouse) {
		const outline = this.getOutline(interaction.outlineId);
		if (!outline) return false;
		const changes = applyPresetSemanticHandle(
			outline,
			interaction.handleId,
			[mouse.x, mouse.y],
			this.getCanvasSize()
		);
		if (this.updateOutline) this.updateOutline(outline.id, changes, { recordHistory: false });
		else Object.assign(outline, changes);
		return true;
	}

	handleOutlineDown(event, outline, canvasInput) {
		return this.handleItemDown(event, outline, canvasInput, {
			type: 'outline',
			remove: (ids) => this.delete(ids)
		});
	}

	handleTouchOutlineDown(event, outline, canvasInput) {
		return this.handleTouchItemDown(event, outline, canvasInput, {
			type: 'outline',
			remove: (ids) => this.delete(ids)
		});
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
		this.renderSemanticHandles({
			layers,
			handles: renderModel.outlines.semanticHandles,
			baseWidth,
			baseHeight,
			canvasInput
		});
	}

	renderSemanticHandles({ layers, handles, baseWidth, baseHeight, canvasInput }) {
		const layer = layers.handles
			.selectAll('g.outline-semantic-controls')
			.data([null])
			.join('g')
			.attr('class', 'outline-semantic-controls');
		const active = this.isSemanticEditMode();
		const displayPoint = (item) => {
			// Pillar/slab height and lean originate at the same logical anchor.
			// Offset them visually so both controls remain reachable.
			if (item.kind === 'lean') return [item.point[0], item.point[1] + 10 / baseHeight];
			if (item.kind === 'scale-height') return [item.point[0] - 10 / baseWidth, item.point[1]];
			return item.point;
		};

		layer
			.selectAll('circle.outline-semantic-hit-area')
			.data(handles, (item) => `${item.outlineId}-${item.id}`)
			.join('circle')
			.attr('class', 'outline-semantic-hit-area cursor-pointer')
			.attr('cx', (item) => displayPoint(item)[0] * baseWidth)
			.attr('cy', (item) => displayPoint(item)[1] * baseHeight)
			.attr('r', (item) => item.hitSize)
			.attr('fill', 'transparent')
			.style('pointer-events', active ? 'auto' : 'none')
			.on('mousedown', (event, item) => this.handleSemanticHandleDown(event, item, canvasInput))
			.on('touchstart', (event, item) => this.handleSemanticHandleTouch(event, item, canvasInput));

		layer
			.selectAll('circle.outline-semantic-handle')
			.data(handles, (item) => `${item.outlineId}-${item.id}`)
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
