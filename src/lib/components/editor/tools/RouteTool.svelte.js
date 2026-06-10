import { userState } from '$lib/state/editor.svelte.js';
import { generateId, generateRouteId } from '$lib/assets/js/id-utils.js';

export class RouteTool {
	id = 'route';
	mode = 'route';
	currentPoints = $state([]);
	drawingTarget = $state(null);

	constructor({ saveHistory } = {}) {
		this.saveHistory = saveHistory || (() => {});
	}

	onMouseDown(event, point) {
		event.stopPropagation();

		// If we have a drawing target (e.g. a specific pitch), we append to it
		if (this.drawingTarget && this.drawingTarget.type === 'pitch') {
			const route = userState.topo.routes.find((r) => r.id === this.drawingTarget.routeId);
			if (route && route.pitches) {
				const pitch = route.pitches.find((p) => p.id === this.drawingTarget.pitchId);
				if (pitch) {
					pitch.points2D = [...(pitch.points2D || []), [point.x, point.y]];
					this.saveHistory();
					return;
				}
			}
		}

		// If we have a selected route (single-pitch), we append to it
		if (userState.ui.selectedRouteId) {
			const route = userState.topo.routes.find((r) => r.id === userState.ui.selectedRouteId);
			if (route && route.type !== 'multi-pitch') {
				route.points2D = [...(route.points2D || []), [point.x, point.y]];
				this.saveHistory();
				return;
			}
		}

		// Otherwise start/continue a new route instance
		this.currentPoints = [...this.currentPoints, [point.x, point.y]];
		this.saveHistory();
	}

	onMouseMove(event, point) {
		// Route tool typically doesn't do much on mouse move unless dragging
	}

	onMouseUp(event, point) {
		// No-op for simple point-by-point drawing
	}

	onKeyDown(event) {
		if (event.key === 'n' || event.key === 'N' || event.key === 'Enter') {
			this.finalize();
		} else if (event.key === 'Escape') {
			this.cancel();
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			if (this.currentPoints.length > 0) {
				this.currentPoints.pop();
				this.saveHistory();
			}
		}
	}

	onActivate() {
		// clean state
	}

	onDeactivate() {
		this.currentPoints = [];
	}

	finalize() {
		if (this.currentPoints.length < 2) {
			if (this.currentPoints.length > 0) console.warn('Route needs at least 2 points');
			return;
		}

		const routeId = generateRouteId();
		const points2D = $state.snapshot(this.currentPoints);

		if (this.mode === 'multipitch') {
			userState.topo.routes.push({
				id: routeId,
				points: [],
				tags: [],
				fixPoints: [],
				name: `Route ${userState.topo.routes.length + 1}`,
				type: 'multi-pitch',
				_gradeScale: 'french',
				pitches: [
					{
						id: generateId('pitch'),
						pitchNumber: 1,
						points2D,
						points: [],
						grade: '5a',
						length: 0,
						type: 'pitch'
					}
				]
			});
		} else {
			userState.topo.routes.push({
				id: routeId,
				points2D,
				points: [],
				tags: [],
				name: `Route ${userState.topo.routes.length + 1}`,
				grade: '5a',
				type: 'sports-climbing'
			});
		}
		userState.ui.selectedRouteId = routeId;

		this.currentPoints = [];
		this.saveHistory();
	}

	cancel() {
		this.currentPoints = [];
	}
}
