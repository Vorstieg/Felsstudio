import { getTouchTargetSize } from '$lib/assets/js/mobile-utils.js';
import { generateId, generateRouteId } from '$lib/assets/js/id-utils.js';

export class RouteTool {
	draftPoints = $state([]);

	constructor({
		state,
		mode = 'route',
		id = 'route',
		getDrawingTarget,
		setDrawingTarget,
		clearSelection,
		selectObject,
		getSelectedId,
		deactivate,
		saveHistory,
		snapPoint,
		referenceFixpoint
	} = {}) {
		this.state = state;
		this.mode = mode;
		this.id = id;
		this.getDrawingTarget = getDrawingTarget || (() => null);
		this.setDrawingTarget = setDrawingTarget || (() => {});
		this.clearSelection = clearSelection || (() => {});
		this.selectObject =
			selectObject ||
			((type, id) => {
				this.state.ui.selectedRouteId = type === 'route' ? id : null;
				this.state.ui.selectedFixpointId = null;
			});
		this.getSelectedId = getSelectedId || (() => this.state.ui.selectedRouteId);
		this.deactivate = deactivate || (() => {});
		this.saveHistory = saveHistory || (() => {});
		this.snapPoint = snapPoint || ((point) => ({ point, fixPointId: null }));
		this.referenceFixpoint = referenceFixpoint || (() => {});
	}
	draftFixPointIds = $state([]);

	appendPoint(mode, point) {
		const snapped = this.snapPoint(point);
		point = snapped.point;
		const target = this.getDrawingTarget();
		const route = target?.routeId && this.findRoute(target.routeId);
		const path = this.getTargetPath(route, target);
		if (path) {
			path.points2D = [...(path.points2D || []), [point.x, point.y]];
			this.referenceFixpoint(route, snapped.fixPointId);
		} else {
			const selectedRoute = mode === 'route' ? this.appendToSelectedRoute(point) : null;
			if (selectedRoute) this.referenceFixpoint(selectedRoute, snapped.fixPointId);
			else {
				this.draftPoints = [...this.draftPoints, [point.x, point.y]];
				this.draftFixPointIds = [...this.draftFixPointIds, snapped.fixPointId];
			}
		}
		this.saveHistory();
	}

	finish(mode) {
		const target = this.getDrawingTarget();
		const draftPointCount = this.draftPoints.length;
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

	findRoute(id) {
		return this.state.topo.routes.find((route) => route.id === id);
	}

	getTargetPath(route, target) {
		if (!route || target?.type === 'newPitch') return null;
		if (target?.type === 'pitch')
			return route.pitches?.find((pitch) => pitch.id === target.pitchId);
		if (target?.type === 'variant')
			return route.variants?.find((variant) => variant.id === target.variantId);
		return null;
	}

	appendToSelectedRoute(point) {
		const route = this.findRoute(this.getSelectedId('route'));
		if (!route || route.type === 'multi-pitch') return null;
		route.points2D = [...(route.points2D || []), [point.x, point.y]];
		return route;
	}

	commitDraft(mode, target) {
		if (this.draftPoints.length < 2) {
			if (this.draftPoints.length) console.warn('Route needs at least 2 points');
			return null;
		}
		const points2D = $state.snapshot(this.draftPoints);
		const fixPointIds = $state.snapshot(this.draftFixPointIds);
		this.draftPoints = [];
		this.draftFixPointIds = [];
		if (mode === 'multipitch' && target?.type === 'newPitch') {
			const route = this.findRoute(target.routeId);
			if (!route || route.type !== 'multi-pitch') return null;
			route.pitches = [
				...(route.pitches || []),
				this.createPitch(route.pitches?.length + 1, points2D)
			];
			fixPointIds.forEach((id) => this.referenceFixpoint(route, id));
			this.selectObject('route', route.id);
			this.saveHistory();
			return route;
		}
		const route = this.createRoute(mode, points2D);
		fixPointIds.forEach((id) => this.referenceFixpoint(route, id));
		this.state.topo.routes.push(route);
		this.selectObject('route', route.id);
		this.saveHistory();
		return route;
	}

	selectNextPitch(route) {
		if (!route || route.type !== 'multi-pitch' || !route.pitches?.length) return;
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

	createPitch(pitchNumber, points2D) {
		return {
			id: generateId('pitch'),
			pitchNumber,
			points2D,
			points: [],
			grade: pitchNumber === 1 ? '5a' : '',
			length: 0,
			lineStyle: '',
			type: 'pitch'
		};
	}

	createRoute(mode, points2D) {
		const baseRoute = {
			id: generateRouteId(),
			points: [],
			fixPoints: [],
			tags: [],
			name: `Route ${this.state.topo.routes.length + 1}`,
			lineStyle: 'red'
		};
		if (mode === 'multipitch')
			return {
				...baseRoute,
				fixPoints: [],
				type: 'multi-pitch',
				_gradeScale: 'french',
				pitches: [this.createPitch(1, points2D)]
			};
		if (mode === 'alpine-tour')
			return { ...baseRoute, points2D, hochtourGrade: 'PD', type: 'alpine-tour' };
		if (mode === 'via-ferrata')
			return { ...baseRoute, points2D, viaFerrataGrade: 'K3', type: 'via-ferrata' };
		return { ...baseRoute, points2D, grade: '5a', _gradeScale: 'french', type: 'sports-climbing' };
	}

	onMouseDown(event, point) {
		event.stopPropagation();
		this.appendPoint(this.mode, point);
	}

	onMouseMove() {}

	onMouseUp() {}

	onKeyDown(event) {
		if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') this.finalize();
		else if (event.key === 'Escape') this.cancel();
		else if (event.key === 'Delete' || event.key === 'Backspace') this.undoLastPoint();
	}

	onActivate() {}

	onDeactivate() {
		this.cancel();
	}

	finalize() {
		this.finish(this.mode);
	}

	cancel() {
		this.draftPoints = [];
		this.draftFixPointIds = [];
	}

	undoLastPoint() {
		if (!this.draftPoints.length) return;
		this.draftPoints = this.draftPoints.slice(0, -1);
		this.draftFixPointIds = this.draftFixPointIds.slice(0, -1);
		this.saveHistory();
	}

	render({ layers, activeTool, baseWidth, baseHeight }) {
		const points = activeTool === this.mode ? this.draftPoints : [];
		const layer = layers.current;
		const previewClass = `current-${this.mode}-path`;
		const pointClass = `current-${this.mode}-point`;
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

		layer
			.selectAll(`circle.${pointClass}`)
			.data(points)
			.join('circle')
			.attr('class', pointClass)
			.attr('fill', '#ff00ff')
			.attr('r', getTouchTargetSize(3))
			.attr('cx', ([x]) => x * baseWidth)
			.attr('cy', ([, y]) => y * baseHeight);
	}
}
