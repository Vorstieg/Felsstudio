import {
	EditablePathEditTool,
	type EditablePathPointControl
} from './EditablePathEditTool.svelte.ts';
import type { CanvasInput } from '../2d/create-canvas-input.svelte.ts';
import { snapPointToGrid } from './path-drawing-logic.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type {
	InteractionPoint,
	RoutePointTarget,
	SelectionSnapshot
} from '$lib/state/topo-2d-editor-interactions.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;

/** Editing controls and mutations for persisted 2D routes, pitches, and variants. */
export class RouteEditTool extends EditablePathEditTool {
	snapToGrid = $state(false);
	gridSize = $state(0.01);
	getTopo: () => Editor['topo'];
	selectPath: Editor['selectPath'];
	selectItems: NonNullable<Editor['selectItems']>;
	removeItems: NonNullable<Editor['removeItems']>;
	setDrawingTarget: Editor['setDrawingTarget'];
	deleteRoutes: Editor['deleteRoutes'];
	getSelectedRoutePoints: Editor['getSelectedRoutePoints'];
	isRoutePointSelected: Editor['isRoutePointSelected'];

	snapPoint(point: InteractionPoint) {
		return snapPointToGrid(point, { enabled: this.snapToGrid, gridSize: this.gridSize });
	}

	constructor(
		editor: Editor,
		{
			getEditablePath,
			beginSelectionMove
		}: {
			getEditablePath?: (
				target: import('$lib/state/topo-2d-editor-interactions.ts').EditablePathTarget
			) => import('../2d/editable-path.ts').EditablePath | null;
			beginSelectionMove?: (point: InteractionPoint) => SelectionSnapshot | null;
		} = {}
	) {
		super(editor, {
			id: 'routeEdit',
			getEditablePath,
			beginSelectionMove,
			targetFromPoint: ({ routeId, pitchId, variantId }) =>
				routeId == null ? null : { routeId, pitchId, variantId },
			targetFromMidpoint: ({ routeId, pitchId, variantId }) =>
				routeId == null ? null : { routeId, pitchId, variantId }
		});
		this.getTopo = () => editor.topo;
		this.selectPath = (...args) => editor.selectPath(...args);
		this.selectItems = (...args) => editor.selectItems?.(...args);
		this.removeItems = (...args) => editor.removeItems?.(...args);
		this.setDrawingTarget = (target) => editor.setDrawingTarget(target);
		this.deleteRoutes = (...args) => editor.deleteRoutes(...args);
		this.getSelectedRoutePoints = () => editor.getSelectedRoutePoints();
		this.isRoutePointSelected = (target) => editor.isRoutePointSelected(target);
	}

	handlePointDown(event: MouseEvent, point: EditablePathPointControl, canvasInput: CanvasInput) {
		if (this.shouldIgnoreCompatibilityMouseEvent(event)) {
			event.preventDefault?.();
			event.stopPropagation?.();
			return true;
		}
		const target = this.targetFromPoint(point) as RoutePointTarget | null;
		if (!target) return super.handlePointDown(event, point, canvasInput);
		const selected = this.getSelectedRoutePoints();
		if (selected.length > 1 && this.isRoutePointSelected({ ...target, index: point.index })) {
			const mouse = canvasInput.normalizeEvent(event)?.point;
			if (!mouse) return false;
			event.stopPropagation?.();
			const points = selected.flatMap((selectedTarget) => {
				const path = this.getEditablePath(selectedTarget);
				const start = path?.getPoints?.()[selectedTarget.index];
				return start
					? [{ target: selectedTarget, start: [start[0], start[1]] as [number, number] }]
					: [];
			});
			this.startInteraction({ kind: 'move-points', startMouse: mouse, points });
			return true;
		}
		return super.handlePointDown(event, point, canvasInput);
	}

	handleRouteDown(
		event: MouseEvent & { identifier?: number },
		routeTarget: {
			id: string | number;
			pitchId?: string | number | null;
			variantId?: string | number | null;
		},
		canvasInput: CanvasInput
	) {
		if (
			(routeTarget?.pitchId || routeTarget?.variantId) &&
			((event?.identifier != null && this.getMobileSelectionMode()) || this.getIsShiftPressed())
		) {
			const kind = routeTarget.pitchId ? 'pitch' : 'variant';
			const pathId = routeTarget.pitchId || routeTarget.variantId;
			if (pathId == null) return false;
			if (this.isSelected(kind, pathId)) this.removeItems([{ type: kind, id: pathId }]);
			else
				this.selectItems(
					[
						{ type: 'route', id: routeTarget.id },
						{ type: kind, id: pathId }
					],
					'add'
				);
			this.setDrawingTarget(null);
			return true;
		}
		return this.handleItemDown(event, routeTarget, canvasInput, this.routeItemOptions());
	}

	handleTouchRouteDown(
		event: TouchEvent,
		routeTarget: {
			id: string | number;
			pitchId?: string | number | null;
			variantId?: string | number | null;
		},
		canvasInput: CanvasInput
	) {
		return this.handleTouchItemDown(event, routeTarget, canvasInput, this.routeItemOptions());
	}

	routeItemOptions(): Parameters<EditablePathEditTool['handleItemDown']>[3] {
		return {
			type: 'route',
			remove: (ids) => this.delete(ids),
			beforeMove: ({ id = '', pitchId = null, variantId = null }) => {
				if (this.selectPath && (pitchId || variantId)) {
					const kind = pitchId ? 'pitch' : 'variant';
					const pathId = pitchId || variantId;
					if (pathId == null) return false;
					if (this.isSelected(kind, pathId)) {
						this.selectObject('route', id, false);
						this.setDrawingTarget(null);
						return false;
					}
					this.selectPath(kind, id, pathId);
					this.setDrawingTarget(
						pitchId
							? { type: 'pitch', routeId: id, pitchId }
							: { type: 'variant', routeId: id, variantId: pathId }
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

	handleLabelDown(
		event: MouseEvent,
		label: {
			id: string | number;
			pitchId?: string | number | null;
			variantId?: string | number | null;
		}
	) {
		if (!this.isEditMode()) return false;
		event.stopPropagation?.();
		this.startInteraction({
			kind: 'move-route-label',
			routeId: label.id,
			pitchId: label.pitchId,
			variantId: label.variantId
		});
		return true;
	}

	delete(ids: Array<string | number>) {
		return this.deleteRoutes(ids, { recordHistory: false });
	}

	onMouseDown() {}
	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}

	render({
		layers,
		renderModel,
		activeTool,
		baseWidth,
		baseHeight,
		canvasInput,
		hideControlPoints
	}: {
		layers: {
			routes: import('d3-selection').Selection<SVGGElement, unknown, null, undefined>;
			handles: import('d3-selection').Selection<SVGGElement, unknown, null, undefined>;
		};
		renderModel: {
			routeLabels: Array<{
				id: string | number;
				pitchId?: string | number | null;
				variantId?: string | number | null;
				points: [number, number][];
				routeObj?: { labelOffset2D?: [number, number] };
				lineSelected: boolean;
				label: string;
			}>;
			routePointHandles: Array<{
				routeId: string | number;
				pitchId?: string | number | null;
				variantId?: string | number | null;
				index: number;
				point: [number, number];
				hitSize: number;
				handleSize: number;
				selected?: boolean;
			}>;
			routeMidpoints: Array<{
				routeId: string | number;
				pitchId?: string | number | null;
				variantId?: string | number | null;
				insertIndex: number;
				midX: number;
				midY: number;
				midpointHitSize: number;
				midpointSize: number;
			}>;
		};
		activeTool: string;
		baseWidth: number;
		baseHeight: number;
		canvasInput: CanvasInput;
		hideControlPoints?: boolean;
	}) {
		const canEdit = this.isEditMode(activeTool);
		const routesLayer = layers.routes;

		routesLayer
			.selectAll<SVGTextElement, (typeof renderModel.routeLabels)[number]>('text.route-label')
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
			.on('mousedown', (event, item) => this.handleLabelDown(event, item))
			.on('touchstart', (event, item) =>
				this.handleTouchControl(event, this.handleLabelDown, item, canvasInput)
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
			pointTarget: (item) => ({
				routeId: item.routeId,
				pitchId: item.pitchId,
				variantId: item.variantId,
				index: item.index
			}),
			midpointTarget: (item) => ({
				routeId: item.routeId,
				pitchId: item.pitchId,
				variantId: item.variantId,
				insertIndex: item.insertIndex,
				midX: item.midX,
				midY: item.midY
			}),
			canvasInput,
			baseWidth,
			baseHeight,
			hideControlPoints
		});
	}
}
