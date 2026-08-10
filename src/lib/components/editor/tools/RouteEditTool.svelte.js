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
		getSelectedRoutePoints,
		isRoutePointSelected,
		saveHistory
	} = {}) {
		super({
			context,
			id: 'routeEdit',
			getActiveTool,
			getEditablePath,
			startInteraction: context?.selection?.startInteraction || startInteraction,
			saveHistory: context?.history?.save || saveHistory,
			isSelected,
			selectObject,
			getIsShiftPressed,
			getMobileSelectionMode,
			beginSelectionMove,
			targetFromPoint: ({ routeId, pitchId, variantId }) => ({ routeId, pitchId, variantId }),
			targetFromMidpoint: ({ routeId, pitchId, variantId }) => ({ routeId, pitchId, variantId })
		});
		this.getTopo = getTopo || (() => ({ routes: [] }));
		this.selectPath = context?.selection?.selectPath || null;
		this.setDrawingTarget = setDrawingTarget || (() => {});
		this.deleteRoutes = context?.commands?.deleteRoutes || null;
		this.getSelectedRoutePoints = getSelectedRoutePoints || (() => []);
		this.isRoutePointSelected = isRoutePointSelected || (() => false);
	}

	handlePointDown(event, point, canvasInput) {
		const target = this.targetFromPoint(point);
		const selected = this.getSelectedRoutePoints();
		if (selected.length > 1 && this.isRoutePointSelected({ ...target, index: point.index })) {
			const mouse = canvasInput.normalizeEvent(event)?.point;
			if (!mouse) return false;
			event.stopPropagation?.();
			const points = selected.flatMap((selectedTarget) => {
				const path = this.getEditablePath(selectedTarget);
				const start = path?.getPoints?.()[selectedTarget.index];
				return start ? [{ target: selectedTarget, start: [...start] }] : [];
			});
			this.startInteraction('move-points', { startMouse: mouse, points });
			return true;
		}
		return super.handlePointDown(event, point, canvasInput);
	}

	handleRouteDown(event, routeTarget, canvasInput) {
		return this.handleItemDown(event, routeTarget, canvasInput, this.routeItemOptions());
	}

	handleTouchRouteDown(event, routeTarget, canvasInput) {
		return this.handleTouchItemDown(event, routeTarget, canvasInput, this.routeItemOptions());
	}

	routeItemOptions() {
		return {
			type: 'route',
			remove: (ids) => this.delete(ids),
			beforeMove: ({ id, pitchId = null, variantId = null }) => {
				if (this.selectPath && (pitchId || variantId)) {
					this.selectPath(pitchId ? 'pitch' : 'variant', id, pitchId || variantId);
					this.setDrawingTarget(
						pitchId
							? { type: 'pitch', routeId: id, pitchId }
							: { type: 'variant', routeId: id, variantId }
					);
					return false;
				}
				this.setDrawingTarget(
					pitchId
						? { type: 'pitch', routeId: id, pitchId }
						: variantId
							? { type: 'variant', routeId: id, variantId }
							: null
				);
			}
		};
	}

	handleLabelDown(event, label, _canvasInput) {
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
		const idsToDelete = new Set(ids.map(String));
		if (!idsToDelete.size) return false;
		const topo = this.getTopo();
		if (!topo.routes.some((route) => idsToDelete.has(String(route.id)))) return false;
		topo.routes = topo.routes.filter((route) => !idsToDelete.has(String(route.id)));
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
