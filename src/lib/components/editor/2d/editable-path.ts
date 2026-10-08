import {
	getOutlinePoints,
	editOutlinePath,
	setOutlinePoint,
	translateOutline
} from '$lib/assets/js/outline-geometry.ts';
import type { OutlineDraft } from '$lib/assets/js/outline-geometry.ts';
import {
	insertPathVertex,
	movePathVertex,
	removePathVertex,
	translatePath
} from '$lib/assets/js/path-geometry.ts';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { Pitch, Route, Variant } from '@vorstieg/fels-types/types';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { EditablePathTarget, InteractionId } from '$lib/state/topo-2d-editor-interactions.ts';

type Editor = Pick<ReturnType<typeof createTopo2DEditorState>, 'topo' | 'viewport'>;
type RoutePath = Route | Pitch | Variant;
type RouteTarget = Extract<EditablePathTarget, { routeId: InteractionId }>;

export type EditablePath = {
	target: EditablePathTarget;
	type: 'outline' | 'route';
	getPoints: () => Point2D[];
	snapshot: () => OutlineDraft | Point2D[];
	canRemovePoint: () => boolean;
	movePoint: (index: number, point: Point2D) => void;
	insertPoint: (index: number, point: Point2D) => void;
	removePoint: (index: number) => void;
	translateFrom: (snapshot: OutlineDraft | Point2D[], delta: Point2D) => void;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function setRoutePoints(path: RoutePath, points: Point2D[]) {
	// The editor may hold an in-progress path before it reaches the document's two-point minimum.
	path.points2D = points as NonNullable<Route['points2D']>;
}

/**
 * Provides one editing API for a route, pitch, variant, or outline. The caller
 * only needs to retain a target descriptor ({ routeId, pitchId, variantId } or
 * { outlineId }); the adapter owns the different storage and geometry rules.
 */
export function createEditablePathResolver(editor: Editor) {
	const getTopo = () => editor.topo;
	const getCanvasSize = () => editor.viewport;

	function resolveRouteTarget({ routeId, pitchId, variantId }: RouteTarget): RoutePath | null {
		const route = getTopo().routes.find((item) => String(item.id) === String(routeId));
		if (!route) return null;
		if (pitchId != null)
			return route.pitches?.find((pitch) => String(pitch.id) === String(pitchId)) || null;
		if (variantId != null)
			return route.variants?.find((variant) => String(variant.id) === String(variantId)) || null;
		return route;
	}

	function resolve(target: EditablePathTarget): EditablePath | null {
		if (target.outlineId != null) {
			const outlineId = target.outlineId;
			const findOutline = () =>
				getTopo().outlines.find((outline) => String(outline.id) === String(outlineId));
			if (!findOutline()) return null;
			const getOutline = () => {
				const outline = findOutline();
				if (!outline) throw new Error(`Outline ${outlineId} is no longer available`);
				return outline;
			};

			return {
				target,
				type: 'outline',
				getPoints: () => getOutlinePoints(getOutline(), getCanvasSize()),
				snapshot: () => clone(getOutline()),
				canRemovePoint: () => getOutlinePoints(getOutline(), getCanvasSize()).length > 2,
				movePoint: (index, point) => {
					const outline = getOutline();
					setOutlinePoint(outline, index, point, getCanvasSize());
				},
				insertPoint: (index, point) => {
					const outline = getOutline();
					editOutlinePath(
						outline,
						(points) => insertPathVertex(points, index, point),
						getCanvasSize()
					);
				},
				removePoint: (index) => {
					const outline = getOutline();
					editOutlinePath(outline, (points) => removePathVertex(points, index), getCanvasSize());
				},
				translateFrom: (snapshot, delta) => {
					if (Array.isArray(snapshot)) throw new Error('Expected an outline snapshot');
					const outline = getOutline();
					const movedOutline = clone(snapshot);
					translateOutline(movedOutline, delta[0], delta[1], getCanvasSize());
					Object.assign(outline, movedOutline);
				}
			};
		}

		if (target.routeId == null) return null;
		const routeTarget: RouteTarget = {
			routeId: target.routeId,
			pitchId: target.pitchId,
			variantId: target.variantId
		};
		const getPath = () => {
			const path = resolveRouteTarget(routeTarget);
			if (!path) throw new Error(`Route path ${target.routeId} is no longer available`);
			return path;
		};
		if (!resolveRouteTarget(routeTarget)) return null;

		return {
			target,
			type: 'route',
			getPoints: () => getPath().points2D || [],
			snapshot: () => clone(getPath().points2D || []),
			canRemovePoint: () => (getPath().points2D?.length || 0) > 2,
			movePoint: (index, point) => {
				const path = getPath();
				setRoutePoints(path, movePathVertex(path.points2D || [], index, point, { closed: false }));
			},
			insertPoint: (index, point) => {
				const path = getPath();
				setRoutePoints(
					path,
					insertPathVertex(path.points2D || [], index, point, { closed: false })
				);
			},
			removePoint: (index) => {
				const path = getPath();
				setRoutePoints(
					path,
					removePathVertex(path.points2D || [], index, {
						closed: false,
						minPoints: 2
					})
				);
			},
			translateFrom: (snapshot, delta) => {
				if (!Array.isArray(snapshot)) throw new Error('Expected a route path snapshot');
				setRoutePoints(getPath(), translatePath(snapshot, delta, { closed: false }));
			}
		};
	}

	return { resolve };
}
