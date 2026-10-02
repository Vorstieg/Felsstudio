import { generateId, generateRouteId } from '$lib/assets/js/id-utils.ts';
import { createGrade } from '$lib/assets/js/topo-utils.ts';
import type { Pitch, Route } from '@vorstieg/fels-types/types';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { InteractionPoint, InteractionId } from '$lib/state/topo-2d-editor-interactions.ts';
import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';
import { snapPointToGrid } from './path-drawing-logic.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type DrawingTarget = TopoDrawingTarget | null;
type SnapResult = { point: InteractionPoint; anchorId: InteractionId | null };
type RouteMode = 'route' | 'multipitch' | 'alpine-tour' | 'via-ferrata';
type Point2D = NonNullable<Route['points2D']>[number];
const asPath2D = (points: number[][]): Point2D[] => points.map(([x, y]): Point2D => [x, y]);
type RouteToolOptions = {
	snapPoint?: (point: InteractionPoint) => SnapResult;
	referenceFixpoint?: (route: Route, fixPointId: InteractionId | null) => void;
};
type Path = Route | Pitch | NonNullable<Route['variants']>[number];
type RenderSelection = {
	remove: () => void;
	data: (data: number[][][]) => RenderSelection;
	join: (tag: string) => RenderSelection;
	attr: (name: string, value: string | number | ((path: number[][]) => string)) => RenderSelection;
};
type RenderLayer = { selectAll: (selector: string) => RenderSelection };

export class RouteTool {
	draftPoints = $state<number[][]>([]);
	snapToGrid = $state(false);
	gridSize = $state(0.01);
	curveEnabled = $state(false);
	curveTension = $state(0.45);
	draftFixPointIds = $state<Array<InteractionId | null>>([]);
	state: Editor;
	mode: RouteMode = 'route';
	id = 'route';
	getTopo: () => Editor['topo'];
	getDrawingTarget: () => DrawingTarget;
	setDrawingTarget: (target: DrawingTarget) => void;
	clearSelection: () => void;
	selectObject: (type: 'route', id: InteractionId) => void;
	getSelectedId: (type: 'route') => InteractionId | null;
	saveHistory: () => void;
	snapPoint: (point: InteractionPoint) => SnapResult;
	referenceFixpoint: (route: Route, fixPointId: InteractionId | null) => void;
	selectPath: (...args: Parameters<Editor['selectPath']>) => ReturnType<Editor['selectPath']>;
	addRoute: (...args: Parameters<Editor['addRoute']>) => ReturnType<Editor['addRoute']>;
	appendRoutePoint: (
		...args: Parameters<Editor['appendRoutePoint']>
	) => ReturnType<Editor['appendRoutePoint']>;
	addPitch: (...args: Parameters<Editor['addPitch']>) => ReturnType<Editor['addPitch']>;

	constructor(editor: Editor, { snapPoint, referenceFixpoint }: RouteToolOptions = {}) {
		this.state = editor;
		this.mode = 'route';
		this.id = 'route';
		this.getTopo = () => this.state.topo;
		if (editor?.drafts) {
			const draft = () => editor.drafts[this.mode === 'multipitch' ? 'multipitch' : 'route'];
			Object.defineProperties(this, {
				draftPoints: {
					configurable: true,
					get: () => draft().points,
					set: (value) => {
						draft().points = value;
						editor.refreshPendingChanges();
					}
				},
				draftFixPointIds: {
					configurable: true,
					get: () => draft().fixPointIds,
					set: (value) => {
						draft().fixPointIds = value;
					}
				}
			});
		}
		this.getDrawingTarget = () => this.state.ui.drawingTarget;
		this.setDrawingTarget = (target) => this.state.setDrawingTarget(target);
		this.clearSelection = () => this.state.clearSelection();
		this.selectObject = (type, id) => this.state.selectObject(type, id);
		this.getSelectedId = (type) => this.state.selectedId(type);
		this.saveHistory = () => this.state.saveHistory();
		this.snapPoint = snapPoint || ((point) => ({ point, anchorId: null }));
		this.referenceFixpoint = referenceFixpoint || (() => {});
		this.selectPath = (...args) => this.state.selectPath(...args);
		this.addRoute = (...args) => this.state.addRoute(...args);
		this.appendRoutePoint = (...args) => this.state.appendRoutePoint(...args);
		this.addPitch = (...args) => this.state.addPitch(...args);
	}

	appendPoint(mode: RouteMode, point: InteractionPoint): void {
		const gridOptions = { enabled: this.snapToGrid, gridSize: this.gridSize };
		point = snapPointToGrid(point, gridOptions) || point;
		const snapped = this.snapPoint(point);
		point = snapped.point;
		const target = this.getDrawingTarget();
		const route = target?.routeId != null ? this.findRoute(target.routeId) : undefined;
		const path = this.getTargetPath(route, target);
		if (path && route && target && target.type !== 'newPitch') {
			const routeTarget =
				target.type === 'pitch'
					? { type: 'pitch' as const, pitchId: target.pitchId }
					: target.type === 'variant'
						? { type: 'variant' as const, variantId: target.variantId }
						: null;
			this.appendRoutePoint(route.id, routeTarget, point, { recordHistory: false });
			this.referenceFixpoint(route, snapped.anchorId);
		} else {
			const selectedRoute = mode === 'route' ? this.appendToSelectedRoute(point) : null;
			if (selectedRoute) this.referenceFixpoint(selectedRoute, snapped.anchorId);
			else {
				this.draftPoints = [...this.draftPoints, [point.x, point.y]];
				this.draftFixPointIds = [...this.draftFixPointIds, snapped.anchorId];
			}
		}
		this.saveHistory();
	}

	finish(mode: RouteMode): void {
		const target = this.getDrawingTarget();
		const draftPointCount = this.draftPoints.length;
		if (draftPointCount > 0 && draftPointCount < 2) return;
		if (mode === 'multipitch' && target?.type === 'newPitch' && draftPointCount === 0) {
			this.setDrawingTarget(null);
			this.clearSelection();
			return;
		}
		const route = this.commitDraft(mode, target);
		if (mode === 'route' || target?.type === 'variant') {
			this.setDrawingTarget(null);
			this.clearSelection();
			return;
		}
		if (!target && draftPointCount < 2) return;
		this.selectNextPitch(route || this.findRoute(target?.routeId));
	}

	findRoute(id: InteractionId | null | undefined): Route | undefined {
		return this.getTopo().routes.find((route) => route.id === id);
	}

	isMultiPitch(route: Route | null | undefined): boolean {
		return Array.isArray(route?.type)
			? route.type.includes('multi-pitch')
			: route?.type === 'multi-pitch';
	}

	getTargetPath(route: Route | null | undefined, target: DrawingTarget): Path | undefined | null {
		if (!route || target?.type === 'newPitch') return null;
		if (target?.type === 'pitch')
			return route.pitches?.find((pitch) => pitch.id === target.pitchId);
		if (target?.type === 'variant')
			return route.variants?.find((variant) => variant.id === target.variantId);
		return null;
	}

	appendToSelectedRoute(point: InteractionPoint): Route | null {
		const route = this.findRoute(this.getSelectedId('route'));
		if (!route || this.isMultiPitch(route)) return null;
		this.appendRoutePoint(route.id, null, point, { recordHistory: false });
		return route;
	}

	commitDraft(mode: RouteMode, target: DrawingTarget): Route | null {
		if (this.draftPoints.length < 2) {
			if (this.draftPoints.length) console.warn('Route needs at least 2 points');
			return null;
		}
		if (mode === 'multipitch' && target?.type === 'newPitch') {
			const route = this.findRoute(target.routeId);
			if (!route || !this.isMultiPitch(route)) return null;
		}
		const points2D = $state.snapshot(this.draftPoints);
		const fixPointIds = $state.snapshot(this.draftFixPointIds);
		this.draftPoints = [];
		this.draftFixPointIds = [];
		if (mode === 'multipitch' && target?.type === 'newPitch') {
			const route = this.findRoute(target.routeId);
			if (!route || !this.isMultiPitch(route)) return null;
			const pitch = this.createPitch((route.pitches?.length || 0) + 1, asPath2D(points2D));
			this.addPitch(route.id, pitch, { recordHistory: false });
			fixPointIds.forEach((id) => this.referenceFixpoint(route, id));
			this.selectObject('route', route.id);
			this.saveHistory();
			return route;
		}
		const route = this.createRoute(mode, asPath2D(points2D));
		fixPointIds.forEach((id) => this.referenceFixpoint(route, id));
		this.addRoute(route);
		this.selectObject('route', route.id);
		return route;
	}

	selectNextPitch(route: Route | null | undefined): void {
		if (!route || !this.isMultiPitch(route) || !route.pitches?.length) return;
		const target = this.getDrawingTarget();
		const selectedIndex =
			target?.type === 'pitch'
				? route.pitches.findIndex((pitch) => pitch.id === target.pitchId)
				: -1;
		const index = selectedIndex >= 0 ? selectedIndex : route.pitches.length - 1;
		const pitch = route.pitches[index];
		const nextPitch = (pitch.points2D?.length || 0) < 2 ? pitch : route.pitches[index + 1];
		this.selectObject('route', route.id);
		this.setDrawingTarget(
			nextPitch
				? { type: 'pitch', routeId: route.id, pitchId: nextPitch.id }
				: { type: 'newPitch', routeId: route.id }
		);
	}

	createPitch(pitchNumber: number, points2D: Point2D[]): Pitch {
		return {
			id: generateId('pitch'),
			pitchNumber,
			points2D,
			points: [],
			grade: pitchNumber === 1 ? createGrade('5a') : null,
			length: 0,
			lineStyle: '',
			type: 'pitch'
		};
	}

	createRoute(mode: RouteMode, points2D: Point2D[]): Route {
		const baseRoute = {
			id: generateRouteId(),
			points: [],
			fixPoints: [],
			tags: [],
			name: `Route ${this.state.topo.routes.length + 1}`,
			lineStyle: 'red',
			curve: { enabled: this.curveEnabled, tension: this.curveTension }
		};
		if (mode === 'multipitch')
			return {
				...baseRoute,
				fixPoints: [],
				type: 'multi-pitch',
				pitches: [this.createPitch(1, points2D)]
			};
		if (mode === 'alpine-tour')
			return { ...baseRoute, points2D, hochtourGrade: 'PD', type: 'alpine-tour' };
		if (mode === 'via-ferrata')
			return { ...baseRoute, points2D, viaFerrataGrade: 'K3', type: 'via-ferrata' };
		return { ...baseRoute, points2D, grade: createGrade('5a'), type: 'sports-climbing' };
	}

	onMouseDown(event: { stopPropagation: () => void }, point: InteractionPoint): void {
		event.stopPropagation();
		this.appendPoint(this.mode, point);
	}

	onMouseMove(): void {}

	onMouseUp(): void {}

	onKeyDown(event: { key: string }): void {
		if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') this.finalize();
		else if (event.key === 'Escape') this.cancel();
		else if (event.key === 'Delete' || event.key === 'Backspace') this.undoLastPoint();
	}

	onActivate(): void {}

	onDeactivate(): void {
		this.cancel();
	}

	finalize(): void {
		this.finish(this.mode);
	}

	cancel(): void {
		this.draftPoints = [];
		this.draftFixPointIds = [];
	}

	undoLastPoint(): void {
		if (!this.draftPoints.length) return;
		this.draftPoints = this.draftPoints.slice(0, -1);
		this.draftFixPointIds = this.draftFixPointIds.slice(0, -1);
		this.saveHistory();
	}

	render({
		layers,
		activeTool,
		baseWidth,
		baseHeight
	}: {
		layers: { current: RenderLayer };
		activeTool: string;
		baseWidth: number;
		baseHeight: number;
	}): void {
		const points = activeTool === this.mode ? this.draftPoints : [];
		const layer = layers.current;
		const previewClass = `current-${this.mode}-path`;
		const pointClass = `current-${this.mode}-point`;
		layer.selectAll(`circle.${pointClass}`).remove();
		layer
			.selectAll(`polyline.${previewClass}`)
			.data(points.length > 1 ? [points] : [])
			.join('polyline')
			.attr('class', previewClass)
			.attr('fill', 'none')
			.attr('stroke', '#ff00ff')
			.attr('stroke-width', 3)
			.attr('stroke-linecap', 'round')
			.attr('stroke-linejoin', 'round')
			.attr('points', (path) =>
				path.map(([x, y]) => `${x * baseWidth},${y * baseHeight}`).join(' ')
			);
	}
}
