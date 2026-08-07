import { EditablePathEditTool } from './EditablePathEditTool.svelte.js';

/** Editing controls and mutations for persisted 2D routes, pitches, and variants. */
export class RouteEditTool extends EditablePathEditTool {
	constructor({
		context,
		getTopo,
		getActiveTool,
		getEditablePath,
		startInteraction,
		isSelected,
		selectObject,
		getIsShiftPressed,
		getMobileSelectionMode,
		beginSelectionMove,
		setDrawingTarget,
		saveHistory
	} = {}) {
		super({
			context,
			id: 'routeEdit',
			getActiveTool,
			getEditablePath,
			startInteraction: context?.selection?.startInteraction || startInteraction,
			saveHistory: context?.commands?.commit || context?.history?.save || saveHistory,
			targetFromPoint: ({ routeId, pitchId, variantId }) => ({ routeId, pitchId, variantId }),
			targetFromMidpoint: ({ routeId, pitchId, variantId }) => ({ routeId, pitchId, variantId })
		});
		this.getTopo = getTopo || (() => ({ routes: [] }));
		this.isSelected = context?.selection?.isSelected || isSelected || (() => false);
		this.selectObject = context?.selection?.selectObject || selectObject || (() => {});
		this.getIsShiftPressed = getIsShiftPressed || (() => false);
		this.getMobileSelectionMode = getMobileSelectionMode || (() => false);
		this.beginSelectionMove = beginSelectionMove || (() => null);
		this.setDrawingTarget = setDrawingTarget || (() => {});
		this.deleteRoutes = context?.commands?.deleteRoutes || null;
	}

	handleRouteDown(event, routeTarget, canvasInput) {
		if (!this.isEditMode()) return false;
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return false;
		event.stopPropagation?.();

		const { id, pitchId = null, variantId = null } = routeTarget;
		if (event?.identifier != null && this.getMobileSelectionMode()) {
			this.selectObject('route', id, true);
			return true;
		}
		if (this.getIsShiftPressed()) {
			this.selectObject('route', id, true);
			return true;
		}
		if (!this.isSelected('route', id)) this.selectObject('route', id, this.getIsShiftPressed());
		this.setDrawingTarget(
			pitchId
				? { type: 'pitch', routeId: id, pitchId }
				: variantId
					? { type: 'variant', routeId: id, variantId }
					: null
		);
		this.startInteraction('move-selection', this.beginSelectionMove(mouse));
		return true;
	}

	handleTouchRouteDown(event, routeTarget, canvasInput) {
		if (event.touches.length !== 1) return false;
		event.preventDefault();
		event.stopPropagation();
		canvasInput.trackTouch(event.touches[0]);
		return this.handleRouteDown(event.touches[0], routeTarget, canvasInput);
	}

	handleLabelDown(event, label, canvasInput) {
		if (!this.isEditMode()) return false;
		event.stopPropagation?.();
		this.startInteraction('move-route-label', {
			routeId: label.id,
			pitchId: label.pitchId,
			variantId: label.variantId
		});
		return true;
	}

	delete(ids) {
		if (this.deleteRoutes) return this.deleteRoutes(ids, { recordHistory: false });
		const idsToDelete = new Set(ids);
		if (!idsToDelete.size) return false;
		const topo = this.getTopo();
		if (!topo.routes.some((route) => idsToDelete.has(route.id))) return false;
		topo.routes = topo.routes.filter((route) => !idsToDelete.has(route.id));
		return true;
	}

	onMouseDown() {}
	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}

	render({ layers, renderModel, activeTool, baseWidth, baseHeight, canvasInput }) {
		const tool = this;
		const canEdit = this.isEditMode(activeTool);
		const routesLayer = layers.routes;

		routesLayer
			.selectAll('text.route-label')
			.data(
				renderModel.routeLabels,
				(item) => `label-${item.id}-${item.pitchId || item.variantId || 'main'}`
			)
			.join('text')
			.attr('class', 'route-label cursor-move')
			.attr('font-size', '20')
			.attr('font-weight', 'bold')
			.attr('text-anchor', 'middle')
			.style('user-select', 'none')
			.attr(
				'x',
				(item) => (item.points[0][0] + (item.routeObj?.labelOffset2D?.[0] || 0)) * baseWidth
			)
			.attr(
				'y',
				(item) =>
					(item.points[0][1] + (item.routeObj?.labelOffset2D?.[1] || 10 / baseHeight)) * baseHeight
			)
			.attr('fill', (item) => (item.lineSelected ? '#3b82f6' : '#12538b'))
			.style('pointer-events', canEdit ? 'all' : 'none')
			.text((item) => item.label)
			.on('mousedown', (event, item) => tool.handleLabelDown(event, item, canvasInput))
			.on('touchstart', (event, item) =>
				tool.handleTouchControl(event, tool.handleLabelDown, item, canvasInput)
			)
			.on('click', (event) => event.stopPropagation());

		this.renderControls({
			layers,
			pointHandles: renderModel.routePointHandles,
			midpoints: renderModel.routeMidpoints,
			pointKey: (item) =>
				`handle-${item.routeId}-${item.pitchId || item.variantId || 'main'}-${item.index}`,
			midpointKey: (item) =>
				`route-${item.routeId}-mid-${item.pitchId || item.variantId || 'main'}-${item.insertIndex}`,
			pointTarget: (item) => item,
			midpointTarget: (item) => item,
			canvasInput,
			baseWidth,
			baseHeight
		});
	}
}
