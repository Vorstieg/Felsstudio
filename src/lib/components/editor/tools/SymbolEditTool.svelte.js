import { select } from 'd3-selection';
import { topoSymbols } from '@vorstieg/topo-renderer';

/** Editing and transform controls for existing 2D symbols. */
export class SymbolEditTool {
	id = 'symbolEdit';

	constructor({
		context,
		getTopo,
		getCanvasSize,
		getInteraction,
		startInteraction,
		isSelected,
		selectObject,
		getSelectionSize,
		getIsShiftPressed,
		getMobileSelectionMode,
		beginSelectionMove,
		getSelectedSymbolId,
		saveHistory
	} = {}) {
		this.getTopo = getTopo || (() => ({ fixPoints: [], routes: [] }));
		this.getCanvasSize =
			context?.viewport?.getCanvasSize ||
			getCanvasSize ||
			(() => ({ baseWidth: 1, baseHeight: 1 }));
		this.getInteraction = context?.selection?.getInteraction || getInteraction || (() => null);
		this.startInteraction = context?.selection?.startInteraction || startInteraction || (() => {});
		this.isSelected = context?.selection?.isSelected || isSelected || (() => false);
		this.selectObject = context?.selection?.selectObject || selectObject || (() => {});
		this.getSelectionSize = getSelectionSize || (() => 0);
		this.getIsShiftPressed = getIsShiftPressed || (() => false);
		this.getMobileSelectionMode = getMobileSelectionMode || (() => false);
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.getSelectedSymbolId = getSelectedSymbolId || (() => null);
		this.saveHistory =
			context?.commands?.commit || context?.history?.save || saveHistory || (() => {});
		this.deleteSymbols = context?.commands?.deleteSymbols || null;
	}

	getSymbol(id) {
		return this.getTopo().fixPoints.find((symbol) => symbol.id === id) || null;
	}

	getPointerDelta(symbol, mouse) {
		const { baseWidth = 1, baseHeight = 1 } = this.getCanvasSize();
		return {
			x: (mouse.x - symbol.position2D[0]) * baseWidth,
			y: (mouse.y - symbol.position2D[1]) * baseHeight
		};
	}

	getLocalPointerDelta(symbol, mouse) {
		const { x: dx, y: dy } = this.getPointerDelta(symbol, mouse);
		const angle = -((symbol.rotation2D || 0) * Math.PI) / 180;
		return {
			x: dx * Math.cos(angle) - dy * Math.sin(angle),
			y: dx * Math.sin(angle) + dy * Math.cos(angle)
		};
	}

	createMoveInteraction(symbol, mouse) {
		if (!symbol?.position2D) return null;
		return {
			kind: 'move-symbol',
			id: symbol.id,
			startMouse: mouse,
			startPosition: [...symbol.position2D]
		};
	}

	createRotateInteraction(symbol) {
		return symbol?.position2D ? { kind: 'rotate-symbol', id: symbol.id } : null;
	}

	createScaleInteraction(symbol, mouse, axis = null) {
		if (!symbol?.position2D) return null;
		const { x: dx, y: dy } = this.getLocalPointerDelta(symbol, mouse);
		return {
			kind: axis ? `scale-symbol-${axis}` : 'scale-symbol',
			id: symbol.id,
			axis,
			startDist: axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy),
			startScale:
				axis === 'x'
					? symbol.scaleX2D || 1
					: axis === 'y'
						? symbol.scaleY2D || 1
						: symbol.scale2D || 1
		};
	}

	onMouseDown(event, mouse, { symbolId, action = 'move' } = {}) {
		const symbol = this.getSymbol(symbolId);
		if (!symbol) return false;
		event?.stopPropagation?.();

		let interaction;
		if (action === 'rotate') interaction = this.createRotateInteraction(symbol);
		else if (action === 'scale') interaction = this.createScaleInteraction(symbol, mouse);
		else if (action === 'scale-x') interaction = this.createScaleInteraction(symbol, mouse, 'x');
		else if (action === 'scale-y') interaction = this.createScaleInteraction(symbol, mouse, 'y');
		else {
			if (event?.identifier != null && this.getMobileSelectionMode()) {
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
		this.startInteraction(interaction.kind, interaction);
		return true;
	}

	handlePointerDown(event, symbolId, action, canvasInput) {
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		return this.onMouseDown(event, mouse, { symbolId, action });
	}

	handleTouchStart(event, symbolId, action, canvasInput) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackTouch(event.touches[0]);
		return this.handlePointerDown(event.touches[0], symbolId, action, canvasInput);
	}

	onMouseMove(_event, mouse) {
		const interaction = this.getInteraction();
		if (
			![
				'move-symbol',
				'rotate-symbol',
				'scale-symbol',
				'scale-symbol-x',
				'scale-symbol-y'
			].includes(interaction?.kind)
		) {
			return false;
		}

		const symbol = this.getSymbol(interaction.id);
		if (!symbol?.position2D) return false;
		if (interaction.kind === 'move-symbol') {
			symbol.position2D = [
				interaction.startPosition[0] + mouse.x - interaction.startMouse.x,
				interaction.startPosition[1] + mouse.y - interaction.startMouse.y
			];
			return true;
		}

		if (interaction.kind === 'rotate-symbol') {
			const { x: dx, y: dy } = this.getPointerDelta(symbol, mouse);
			symbol.rotation2D = (Math.atan2(dy, dx) * (180 / Math.PI) + 90) % 360;
			return true;
		}
		const { x: dx, y: dy } = this.getLocalPointerDelta(symbol, mouse);
		if (interaction.startDist > 0 && interaction.kind.startsWith('scale-symbol')) {
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
			if (interaction.axis === 'x') symbol.scaleX2D = value;
			else if (interaction.axis === 'y') symbol.scaleY2D = value;
			else symbol.scale2D = value;
			return true;
		}
		return false;
	}

	onMouseUp() {}
	onActivate() {}
	onDeactivate() {}

	onKeyDown(event) {
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

	scale(id, delta) {
		const symbol = this.getSymbol(id);
		if (!symbol) return false;
		symbol.scale2D = Math.max(0.2, Math.min(5, (symbol.scale2D || 1) + delta));
		return true;
	}

	delete(ids) {
		if (this.deleteSymbols) return this.deleteSymbols(ids, { recordHistory: false });
		const idsToDelete = new Set(ids);
		if (!idsToDelete.size) return false;
		const topo = this.getTopo();
		if (!topo.fixPoints.some((symbol) => idsToDelete.has(symbol.id))) return false;

		topo.fixPoints = topo.fixPoints.filter((symbol) => !idsToDelete.has(symbol.id));
		for (const route of topo.routes) {
			if (route.fixPoints) route.fixPoints = route.fixPoints.filter((id) => !idsToDelete.has(id));
			for (const pitch of route.pitches || []) {
				if (idsToDelete.has(pitch.startNodeId)) pitch.startNodeId = null;
				if (idsToDelete.has(pitch.endNodeId)) pitch.endNodeId = null;
			}
		}
		return true;
	}

	/** Renders only the controls belonging to symbol editing, over existing symbol groups. */
	render({ symbolGroups, activeTool, selectedSymbolInstance, canvasInput }) {
		const tool = this;
		symbolGroups.each(function (symbol) {
			const group = select(this);
			const selected =
				selectedSymbolInstance?.id === symbol.id || tool.isSelected('symbol', symbol.id);
			const meta = topoSymbols.find((item) => item.id === symbol.type);
			const baseWidth = meta?.width || 24;
			const baseHeight = meta?.height || 24;
			const scale = symbol.scale2D || 1;
			const scaleX = scale * (symbol.scaleX2D || 1);
			const scaleY = scale * (symbol.scaleY2D || 1);
			// Selection is the regular way to edit a symbol in the 2D editor.
			const showTransformControls = selected && (activeTool === tool.id || activeTool === 'select');
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
					tool.handlePointerDown(event, item.id, 'rotate', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'rotate', canvasInput)
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
					tool.handlePointerDown(event, item.id, 'scale-x', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'scale-x', canvasInput)
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
					tool.handlePointerDown(event, item.id, 'scale-y', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'scale-y', canvasInput)
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
					tool.handlePointerDown(event, item.id, 'scale', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'scale', canvasInput)
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
