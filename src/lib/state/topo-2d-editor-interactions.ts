import type { OutlineDraft } from '$lib/assets/js/outline-geometry.ts';
import type { Point2D } from '@vorstieg/fels-types/types';

export type InteractionId = string | number;
export type InteractionPoint = { x: number; y: number };
export type SelectionMode = 'replace' | 'add' | 'subtract';

export type EditablePathTarget =
	| { outlineId: InteractionId; routeId?: never; pitchId?: never; variantId?: never }
	| {
			routeId: InteractionId;
			pitchId?: InteractionId | null;
			variantId?: InteractionId | null;
			outlineId?: never;
	  };

export type RoutePointTarget = {
	routeId: InteractionId;
	pitchId?: InteractionId | null;
	variantId?: InteractionId | null;
	index: number;
};

export type SelectionSnapshot = {
	startMouse: InteractionPoint;
	items: {
		paths: Array<{ target: EditablePathTarget; snapshot: OutlineDraft | Point2D[] }>;
		symbols: Array<{ symbolId: InteractionId; startPos: Point2D }>;
		texts: Array<{ textId: InteractionId; startPos: Point2D }>;
	};
};

export type Topo2DInteraction =
	| {
			kind: 'selection-region';
			start: InteractionPoint;
			end: InteractionPoint;
			mode: SelectionMode;
	  }
	| ({ kind: 'move-selection' } & SelectionSnapshot)
	| ({ kind: 'move-point'; pointIndex: number } & EditablePathTarget)
	| {
			kind: 'move-points';
			startMouse: InteractionPoint;
			points: Array<{ target: RoutePointTarget; start: Point2D }>;
	  }
	| {
			kind: 'transform-preset-outline';
			outlineId: InteractionId;
			handleId: InteractionId;
			startMouse: Point2D;
			outlineSnapshot: OutlineDraft;
	  }
	| {
			kind: 'move-symbol';
			id: InteractionId;
			startMouse: InteractionPoint;
			startPosition: Point2D;
	  }
	| { kind: 'rotate-symbol'; id: InteractionId }
	| {
			kind: 'scale-symbol' | 'scale-symbol-x' | 'scale-symbol-y';
			id: InteractionId;
			axis: 'x' | 'y' | null;
			startDist: number;
			startScale: number;
	  }
	| {
			kind: 'move-route-label';
			routeId: InteractionId;
			pitchId?: InteractionId | null;
			variantId?: InteractionId | null;
	  };
