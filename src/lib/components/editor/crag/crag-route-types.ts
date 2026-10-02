import type { FelsTopoDocument, Route } from '@vorstieg/fels-types/types';
import type { FelsEntryWorkspace } from '$lib/types/crag';

export type RouteDocument = {
	path: string;
	node: FelsEntryWorkspace;
	data: FelsTopoDocument;
};

export type RouteEntry = { document: RouteDocument; route: Route };

export type CragSelection =
	| { type: 'entry'; key: string }
	| { type: 'route'; key: string }
	| { type: 'approach'; id: string }
	| { type: 'route-path'; documentPath: string; pathId: string; pathIndex?: number };

export type RoutePathRef = NonNullable<Route['pathRefs']>[number];
export type RoutePathFeaturePatch = {
	name?: string;
	description?: string;
	accessFeatureId?: string;
};
