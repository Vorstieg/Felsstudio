import { select } from 'd3-selection';
import { topoSymbols } from '@vorstieg/topo-renderer';

/** Editing and transform controls for existing 2D symbols. */
export class SymbolEditTool {
	id = 'symbolEdit';

	constructor({
		getTopo,
		getCanvasSize,
		getInteraction,
		startInteraction,
		isSelected,
		selectObject,
		getSelectionSize,
		getIsShiftPressed,
		beginSelectionMove,
		getSelectedSymbolId,
		saveHistory
	} = {}) {
		this.getTopo = getTopo || (() => ({ fixPoints: [], routes: [] }));
		this.getCanvasSize = getCanvasSize || (() => ({ baseWidth: 1, baseHeight: 1 }));
		this.getInteraction = getInteraction || (() => null);
		this.startInteraction = startInteraction || (() => {});
		this.isSelected = isSelected || (() => false);
		this.selectObject = selectObject || (() => {});
		this.getSelectionSize = getSelectionSize || (() => 0);
		this.getIsShiftPressed = getIsShiftPressed || (() => false);
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.getSelectedSymbolId = getSelectedSymbolId || (() => null);
		this.saveHistory = saveHistory || (() => {});
	}

	getSymbol(id) {
		return this.getTopo().fixPoints.find((symbol) => symbol.id === id) || null;
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

	createScaleInteraction(symbol, mouse) {
		if (!symbol?.position2D) return null;
		const { baseWidth = 1, baseHeight = 1 } = this.getCanvasSize();
		const dx = (mouse.x - symbol.position2D[0]) * baseWidth;
		const dy = (mouse.y - symbol.position2D[1]) * baseHeight;
		return {
			kind: 'scale-symbol',
			id: symbol.id,
			startDist: Math.hypot(dx, dy),
			startScale: symbol.scale2D || 1
		};
	}

	onMouseDown(event, mouse, { symbolId, action = 'move' } = {}) {
		const symbol = this.getSymbol(symbolId);
		if (!symbol) return false;
		event?.stopPropagation?.();

		let interaction;
		if (action === 'rotate') interaction = this.createRotateInteraction(symbol);
		else if (action === 'scale') interaction = this.createScaleInteraction(symbol, mouse);
		else {
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
		if (!['move-symbol', 'rotate-symbol', 'scale-symbol'].includes(interaction?.kind)) {
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

		const { baseWidth = 1, baseHeight = 1 } = this.getCanvasSize();
		const dx = (mouse.x - symbol.position2D[0]) * baseWidth;
		const dy = (mouse.y - symbol.position2D[1]) * baseHeight;
		if (interaction.kind === 'rotate-symbol') {
			symbol.rotation2D = (Math.atan2(dy, dx) * (180 / Math.PI) + 90) % 360;
			return true;
		}
		if (interaction.kind === 'scale-symbol' && interaction.startDist > 0) {
			symbol.scale2D = Math.max(
				0.2,
				Math.min(5, interaction.startScale * (Math.hypot(dx, dy) / interaction.startDist))
			);
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
			const baseSize = meta?.width || 24;
			const radius = baseSize / 2;
			const showTransformControls = selected && activeTool === tool.id;
			const boxPadding = 5;
			const boxSize = baseSize + boxPadding * 2;
			const boxOffset = -(radius + boxPadding);
			const gizmoSize = boxSize / 4;

			group
				.selectAll('rect.bounding-box')
				.data(showTransformControls ? [symbol] : [])
				.join('rect')
				.attr('class', 'bounding-box')
				.attr('fill', 'none')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '2,2')
				.attr('x', boxOffset)
				.attr('y', boxOffset)
				.attr('width', boxSize)
				.attr('height', boxSize);

			group
				.selectAll('line.rotation-stalk')
				.data(showTransformControls ? [symbol] : [])
				.join('line')
				.attr('class', 'rotation-stalk')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 1)
				.attr('x1', 0)
				.attr('y1', boxOffset)
				.attr('x2', 0)
				.attr('y2', boxOffset - 20);

			group
				.selectAll('circle.rotate-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo rotate-gizmo cursor-alias')
				.attr('fill', '#f59e0b')
				.attr('stroke', 'white')
				.attr('cx', 0)
				.attr('cy', boxOffset - 20)
				.attr('r', gizmoSize)
				.attr('stroke-width', 2 / (symbol.scale2D || 1))
				.on('mousedown', (event, item) =>
					tool.handlePointerDown(event, item.id, 'rotate', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'rotate', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('circle.scale-gizmo')
				.data(showTransformControls ? [symbol] : [])
				.join('circle')
				.attr('class', 'gizmo scale-gizmo cursor-nwse-resize')
				.attr('fill', '#3b82f6')
				.attr('stroke', 'white')
				.attr('cx', -boxOffset)
				.attr('cy', -boxOffset)
				.attr('r', gizmoSize)
				.attr('stroke-width', 2 / (symbol.scale2D || 1))
				.on('mousedown', (event, item) =>
					tool.handlePointerDown(event, item.id, 'scale', canvasInput)
				)
				.on('touchstart', (event, item) =>
					tool.handleTouchStart(event, item.id, 'scale', canvasInput)
				)
				.on('click', (event) => event.stopPropagation());

			group
				.selectAll('circle.selection-circle')
				.data(selected ? [symbol] : [])
				.join('circle')
				.attr('class', 'selection-circle')
				.attr('fill', 'none')
				.attr('stroke', '#3b82f6')
				.attr('stroke-width', 2)
				.attr('stroke-dasharray', '4')
				.attr('cx', 0)
				.attr('cy', 0)
				.attr('r', radius + 10);
		});
	}
}
