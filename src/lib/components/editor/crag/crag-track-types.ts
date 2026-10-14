import type { Point2D } from '@vorstieg/fels-types/types';

export type TrackDraftMode = 'routing' | 'editing' | 'select';
export type RoutePathTarget = {
	documentPath: string;
	pathId: string;
	pathIndex?: number | null;
	routeId?: string | number;
	isNew?: boolean;
};
export type ActiveTrackTarget =
	{ kind: 'access'; featureId: string } | ({ kind: 'route-path' } & RoutePathTarget);
export type AccessTrackFeature = {
	type?: 'Feature';
	id: string;
	geometry: { type: string; coordinates: Point2D[] } | null;
	properties?: { kind?: string; name?: string; [key: string]: unknown } | null;
};
export type TrackJoinPreview = {
	target: ActiveTrackTarget;
	candidatePoints: Point2D[];
	points: Point2D[];
	connection: Point2D[];
	gapMeters: number;
	targetName: string;
	name: string;
};
export type TrackGeometryPreview = { points: Point2D[]; tails: Point2D[][]; coordinate?: Point2D };
export type TrackOperation =
	| { kind: 'idle' }
	| { kind: 'box'; start: Point2D | null; end: Point2D | null; preview: number[] | null }
	| ({ kind: 'trim' } & TrackGeometryPreview)
	| { kind: 'split'; preview: TrackGeometryPreview | null }
	| { kind: 'join'; preview: TrackJoinPreview | null };
