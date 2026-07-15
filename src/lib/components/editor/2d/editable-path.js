import {
	getOutlinePoints,
	insertOutlinePoint,
	removeOutlinePoint,
	setOutlinePoint,
	translateOutline
} from '$lib/assets/js/outline-geometry.js';
import {
	insertPathVertex,
	movePathVertex,
	removePathVertex,
	translatePath
} from '$lib/assets/js/path-geometry.js';

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

/**
 * Provides one editing API for a route, pitch, variant, or outline. The caller
 * only needs to retain a target descriptor ({ routeId, pitchId, variantId } or
 * { outlineId }); the adapter owns the different storage and geometry rules.
 */
export function createEditablePathResolver({ getTopo, getCanvasSize }) {
	function resolveRouteTarget({ routeId, pitchId, variantId }) {
		const route = getTopo().routes.find((item) => item.id === routeId);
		if (!route) return null;
		if (pitchId) return route.pitches?.find((pitch) => pitch.id === pitchId) || null;
		if (variantId) return route.variants?.find((variant) => variant.id === variantId) || null;
		return route;
	}

	function resolve(target) {
		if (target.outlineId) {
			const getOutline = () => getTopo().outlines.find((outline) => outline.id === target.outlineId);
			if (!getOutline()) return null;

			return {
				target,
				type: 'outline',
				getPoints: () => getOutlinePoints(getOutline(), getCanvasSize()),
				snapshot: () => clone(getOutline()),
				canRemovePoint: () => getOutlinePoints(getOutline(), getCanvasSize()).length > 2,
				movePoint: (index, point) =>
					setOutlinePoint(getOutline(), index, point, getCanvasSize()),
				insertPoint: (index, point) =>
					insertOutlinePoint(getOutline(), index, point, getCanvasSize()),
				removePoint: (index) => removeOutlinePoint(getOutline(), index, getCanvasSize()),
				translateFrom: (snapshot, delta) => {
					const outline = getOutline();
					const movedOutline = clone(snapshot);
					translateOutline(movedOutline, delta[0], delta[1], getCanvasSize());
					Object.assign(outline, movedOutline);
				}
			};
		}

		const getPath = () => resolveRouteTarget(target);
		if (!getPath()) return null;

		return {
			target,
			type: 'route',
			getPoints: () => getPath().points2D || [],
			snapshot: () => clone(getPath().points2D || []),
			canRemovePoint: () => (getPath().points2D?.length || 0) > 2,
			movePoint: (index, point) => {
				const path = getPath();
				path.points2D = movePathVertex(path.points2D || [], index, point, { closed: false });
			},
			insertPoint: (index, point) => {
				const path = getPath();
				path.points2D = insertPathVertex(path.points2D || [], index, point, { closed: false });
			},
			removePoint: (index) => {
				const path = getPath();
				path.points2D = removePathVertex(path.points2D || [], index, {
					closed: false,
					minPoints: 2
				});
			},
			translateFrom: (snapshot, delta) => {
				getPath().points2D = translatePath(snapshot, delta, { closed: false });
			}
		};
	}

	return { resolve };
}
