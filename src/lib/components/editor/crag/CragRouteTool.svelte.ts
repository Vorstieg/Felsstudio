import { generateId, generateRouteId } from '$lib/assets/js/id-utils.ts';
import {
	workspaceDocumentPaths,
	workspaceNodeDocumentPaths
} from '$lib/assets/js/workspace-paths.ts';
import {
	assignTopoPath,
	createPathFeature,
	findTopoPath,
	splitTopoPath
} from '$lib/assets/js/topo-document-paths.ts';
import type { CragEditorSession } from '$lib/types/crag';
import type { FelsTopoDocument, PathFeature, Route } from '@vorstieg/fels-types/types';
import type {
	CragSelection,
	RouteDocument,
	RoutePathFeaturePatch,
	RoutePathRef
} from './crag-route-types.ts';

type Id = string | number;
type AccessFeature = {
	id?: string;
	properties?: { kind?: string; name?: string };
	geometry?: { coordinates?: number[][] };
};

type CragRouteToolOptions = {
	state: CragEditorSession;
	getSelection: () => CragSelection | null;
	selectObject: (selection: CragSelection | null) => void;
	getRouteDraft: () => { documentPath?: string; routeId?: string | number; pathId?: string } | null;
	cancelTrackEdit: () => void;
	startRouteDraft: (draft: {
		documentPath: string;
		routeId?: string | number;
		pathId: string;
		pathIndex?: number;
	}) => void;
	startRoutingDraft: () => void;
	editRoutePathTrack: (coordinates: [number, number][]) => void;
	setActiveTool: (tool: string) => void;
};

/** Route-document and route-path workflows for the crag editor. */
export function createCragRouteTool({
	state,
	getSelection,
	selectObject,
	getRouteDraft,
	cancelTrackEdit,
	startRouteDraft,
	startRoutingDraft,
	editRoutePathTrack,
	setActiveTool
}: CragRouteToolOptions) {
	function documents(): RouteDocument[] {
		const active = state.getActiveWorkspaceEntry();
		return [active, ...(active?.childEntries || [])].flatMap((node) =>
			node?.entry?.properties.id && node.topo
				? [
						{
							node,
							path: workspaceNodeDocumentPaths(node).topo,
							data: node.topo
						}
					]
				: []
		);
	}
	function documentAt(path: string): RouteDocument | undefined {
		return documents().find((document) => document.path === path);
	}
	function updateDocument(
		path: string,
		updater: (topo: FelsTopoDocument, document: RouteDocument) => void
	) {
		const document = documentAt(path);
		return document
			? state.updateWorkspaceTopo(
					path,
					(topo) => updater(topo, document),
					state.getWorkspaceEntryPath(document.node)
				)
			: null;
	}
	function markDirty(path: string) {
		const document = documentAt(path);
		if (document) state.markWorkspaceDirty(path, state.getWorkspaceEntryPath(document.node));
	}

	function getRouteDocument(sectorId: string | null): RouteDocument | null {
		const active = state.getActiveWorkspaceEntry();
		const node = sectorId
			? active?.childEntries.find((child) => child.entry?.properties.id === sectorId)
			: active;
		return node?.topo ? (documents().find((document) => document.node === node) ?? null) : null;
	}

	function createRouteDocument(sectorId: string | null): RouteDocument | null {
		const active = state.getActiveWorkspaceEntry();
		const crag = active?.entry;
		const node = sectorId
			? active?.childEntries.find((child) => child.entry?.properties.id === sectorId)
			: active;
		if (!node) return null;
		const sectorPaths = workspaceDocumentPaths(
			node?.path || '',
			String(node?.entry?.properties.id || '')
		);
		return {
			path: sectorPaths.topo,
			node,
			data: {
				id: sectorId ? `${crag?.properties.id}:${sectorId}` : crag?.properties.id,
				name: sectorId || crag?.properties.name,
				routes: [],
				paths: { type: 'FeatureCollection', features: [] }
			} as FelsTopoDocument
		};
	}

	function addRoute(sectorId: string | null = null) {
		let document = getRouteDocument(sectorId);
		if (!document) {
			document = createRouteDocument(sectorId);
			if (!document) return;
			document.node.topo = document.data;
			state.markWorkspaceDirty(document.path, state.getWorkspaceEntryPath(document.node));
		}

		let routeId: string;
		do {
			routeId = generateRouteId();
		} while (
			documents().some((entry) => (entry.data.routes || []).some((route) => route.id === routeId))
		);

		const route = { id: routeId, name: '', type: 'sports-climbing', tags: [], pathRefs: [] };
		updateDocument(document.path, (data) => {
			data.routes = [...(data.routes || []), route];
		});
		selectObject({ type: 'route', key: `${document.path}:${route.id}` });
	}

	function deleteRoute(path: string, routeId: Id) {
		const document = documentAt(path);
		if (!document) return;
		const routeKey = `${path}:${routeId}`;
		const selection = getSelection();
		const isSelectedRoute = selection?.type === 'route' && selection.key === routeKey;
		const draft = getRouteDraft();
		const isDraftForRoute =
			draft != null && draft.documentPath === path && String(draft.routeId) === String(routeId);
		if (isDraftForRoute) cancelTrackEdit();
		updateDocument(path, (data) => {
			data.routes = (data.routes || []).filter((route) => String(route.id) !== String(routeId));
		});
		if (isSelectedRoute || isDraftForRoute) selectObject(null);
	}

	function selectRoute(path: string, routeId: Id) {
		selectObject({ type: 'route', key: `${path}:${routeId}` });
	}

	function updateRoute(path: string, routeId: Id, patch: Partial<Route>) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => Object.assign(current, patch));
	}

	function updateRoutePaths(
		path: string,
		routeId: Id,
		update: (paths: RoutePathRef[]) => RoutePathRef[]
	) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => {
			current.pathRefs = update(current.pathRefs || []);
		});
	}

	function addRoutePath(path: string, routeId: Id) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((route) => String(route.id) === String(routeId))) return;
		let pathId: string;
		do {
			pathId = generateId('path');
		} while (document.data.paths?.features?.some((feature) => String(feature.id) === pathId));
		const pathIndex = document.data.paths?.features.length || 0;
		updateDocument(path, (data) => {
			data.paths = data.paths || { type: 'FeatureCollection', features: [] };
			data.paths.features = [
				...data.paths.features,
				{
					type: 'Feature',
					id: pathId,
					properties: { name: 'Route path' },
					geometry: { type: 'LineString', coordinates: [] }
				}
			] as NonNullable<FelsTopoDocument['paths']>['features'];
			const route = data.routes.find((item) => String(item.id) === String(routeId));
			if (route) route.pathRefs = [...(route.pathRefs || []), { pathId, role: 'main' }];
		});
		startRouteDraft({ documentPath: path, routeId, pathId, pathIndex });
		startRoutingDraft();
	}

	function assignExistingRoutePath(
		path: string,
		routeId: Id,
		pathId: Id,
		role = 'main',
		label = ''
	) {
		const document = documentAt(path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		let assigned = false;
		state.commit('Assign route path', () => {
			assigned = assignTopoPath(document.data, routeId, pathId, { role, label });
			if (assigned) markDirty(path);
		});
		return assigned;
	}

	function createRoutePathFromAccess(documentPath: string, routeId: Id, accessFeatureId: string) {
		const document = documentAt(documentPath);
		const access = ((state.getWorkspaceAccess()?.features || []) as AccessFeature[]).find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		const coordinates = access?.geometry?.coordinates;
		if (!document || !access || !coordinates?.length) return false;
		let pathId: string;
		do {
			pathId = generateId('path');
		} while (document.data.paths?.features?.some((feature) => String(feature.id) === pathId));
		updateDocument(documentPath, (data) => {
			data.paths = data.paths || { type: 'FeatureCollection', features: [] };
			data.paths.features = [
				...data.paths.features,
				createPathFeature(
					coordinates,
					{ name: access.properties?.name || 'Copied access path' },
					pathId
				) as NonNullable<FelsTopoDocument['paths']>['features'][number]
			];
			assignTopoPath(data, routeId, pathId, {
				role: 'approach',
				label: access.properties?.name || ''
			});
		});
		return true;
	}

	function moveApproachTrackToTopoPaths(documentPath: string, accessFeatureId: string) {
		const document = documentAt(documentPath);
		const accessNode = state.getActiveWorkspaceEntry();
		const accessDocument = state.getWorkspaceAccess();
		const access = ((accessDocument?.features || []) as AccessFeature[]).find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		const coordinates = access?.geometry?.coordinates;
		if (!document || !accessNode?.entry || !access || !coordinates || coordinates.length < 2)
			return false;

		let pathId: string;
		do {
			pathId = generateId('path');
		} while (document.data.paths?.features?.some((feature) => String(feature.id) === pathId));

		state.commit('Move approach track to topo paths', () => {
			document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
			document.data.paths.features = [
				...document.data.paths.features,
				createPathFeature(
					coordinates,
					{ name: access.properties?.name || 'Approach track' },
					pathId
				) as NonNullable<FelsTopoDocument['paths']>['features'][number]
			];
			markDirty(documentPath);
			accessDocument!.features = (accessDocument!.features as AccessFeature[]).filter(
				(feature) => feature.id !== accessFeatureId
			);
			state.markWorkspaceDirty(
				workspaceNodeDocumentPaths(accessNode).access,
				state.getWorkspaceEntryPath(accessNode)
			);
		});
		const selection = getSelection();
		if (selection?.type === 'approach' && selection.id === accessFeatureId) {
			selectObject({ type: 'route-path', documentPath, pathId: String(pathId) });
		}
		return true;
	}

	function findPathFeature(
		document: RouteDocument | null | undefined,
		pathId: string | number,
		pathIndex: number | null = null
	) {
		const features = document?.data.paths?.features || [];
		if (
			pathIndex !== null &&
			Number.isInteger(pathIndex) &&
			String(features[pathIndex]?.id) === String(pathId)
		)
			return features[pathIndex];
		return features.find((item) => String(item.id) === String(pathId));
	}

	function saveRoutePathCoordinates(
		{
			documentPath,
			pathId,
			pathIndex
		}: { documentPath: string; pathId: string; pathIndex?: number | null },
		coordinates: number[][]
	) {
		const document = documentAt(documentPath);
		const feature = findPathFeature(document, pathId, pathIndex ?? null);
		if (!feature) return false;
		updateDocument(documentPath, () => {
			// Map editing uses longitude/latitude pairs; the shared schema also permits altitude.
			feature.geometry = {
				type: 'LineString',
				coordinates: coordinates as PathFeature['geometry']['coordinates']
			};
		});
		return true;
	}

	function editRoutePath(
		path: string,
		routeId: Id | undefined,
		pathId: Id | undefined,
		pathIndex: number | null = null
	) {
		if (pathId == null) return;
		const document = documentAt(path);
		const feature = findPathFeature(
			document,
			pathId,
			Number.isInteger(pathIndex) ? pathIndex : null
		);
		if (!feature) return;
		const coordinates = feature.geometry.coordinates;
		const resolvedPathIndex = (document?.data.paths?.features || []).indexOf(feature);
		startRouteDraft({
			documentPath: path,
			routeId,
			pathId: String(pathId),
			pathIndex: resolvedPathIndex
		});
		editRoutePathTrack(coordinates.map(([longitude, latitude]) => [longitude, latitude]));
	}

	function duplicateRoutePath(path: string, pathId: Id | undefined) {
		if (pathId == null) return false;
		const document = documentAt(path);
		const feature = document ? findTopoPath(document.data, pathId) : null;
		if (!document || !feature) return false;
		let duplicatePathId: string;
		do {
			duplicatePathId = generateId('path');
		} while (document.data.paths?.features?.some((item) => String(item.id) === duplicatePathId));
		const duplicateFeature = JSON.parse(JSON.stringify(feature));
		duplicateFeature.id = duplicatePathId;
		duplicateFeature.properties = {
			...(duplicateFeature.properties || {}),
			name: duplicateFeature.properties?.name
				? `${duplicateFeature.properties.name} copy`
				: 'Route path copy'
		};
		updateDocument(path, (data) => {
			data.paths = data.paths || { type: 'FeatureCollection', features: [] };
			data.paths.features = [...data.paths.features, duplicateFeature];
		});
		return true;
	}

	function splitRoutePath(
		{
			documentPath,
			pathId,
			routeId: _routeId
		}: { documentPath: string; pathId: string; routeId?: string | number },
		startCoordinates: number[][],
		endCoordinates: number[][]
	) {
		if (startCoordinates.length < 2 || endCoordinates.length < 2) return false;
		const document = documentAt(documentPath);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		let split = false;
		state.commit('Split route path', () => {
			split = splitTopoPath(document.data, pathId, startCoordinates, endCoordinates).length > 0;
			if (split) markDirty(documentPath);
		});
		if (!split) return false;
		cancelTrackEdit();
		setActiveTool('geometry');
		return true;
	}

	function pointDistance(a: number[] | undefined, b: number[] | undefined) {
		if (!a || !b) return Infinity;
		return Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]));
	}

	function orientConcatCoordinates(firstCoordinates: number[][], secondCoordinates: number[][]) {
		const first = firstCoordinates.map((point) => [...point]);
		const second = secondCoordinates.map((point) => [...point]);
		const reversedSecond = [...second].reverse();
		const options = [
			{
				distance: pointDistance(first.at(-1), second[0]),
				coordinates: [...first, ...second.slice(1)]
			},
			{
				distance: pointDistance(first.at(-1), second.at(-1)),
				coordinates: [...first, ...reversedSecond.slice(1)]
			},
			{
				distance: pointDistance(first[0], second.at(-1)),
				coordinates: [...second, ...first.slice(1)]
			},
			{
				distance: pointDistance(first[0], second[0]),
				coordinates: [...reversedSecond, ...first.slice(1)]
			}
		];
		return options.sort((a, b) => a.distance - b.distance)[0].coordinates;
	}

	function concatRoutePaths(
		path: string,
		basePathId: Id | undefined,
		appendPathId: Id | undefined,
		basePathIndex: number | null = null,
		appendPathIndex: number | null = null
	) {
		if (basePathId == null || appendPathId == null) return false;
		const document = documentAt(path);
		const features = document?.data.paths?.features || [];
		const baseIndex =
			basePathIndex !== null && Number.isInteger(basePathIndex)
				? basePathIndex
				: features.findIndex((feature) => String(feature.id) === String(basePathId));
		const appendIndex =
			appendPathIndex !== null && Number.isInteger(appendPathIndex)
				? appendPathIndex
				: features.findIndex(
						(feature, index) => index !== baseIndex && String(feature.id) === String(appendPathId)
					);
		const base = features[baseIndex];
		const append = features[appendIndex];
		if (
			!base ||
			!append ||
			baseIndex === appendIndex ||
			base.geometry?.type !== 'LineString' ||
			append.geometry?.type !== 'LineString' ||
			base.geometry.coordinates?.length < 2 ||
			append.geometry.coordinates?.length < 2
		)
			return false;

		updateDocument(path, (data) => {
			base.geometry = {
				type: 'LineString',
				coordinates: orientConcatCoordinates(
					base.geometry.coordinates,
					append.geometry.coordinates
				) as unknown as PathFeature['geometry']['coordinates']
			};
			const baseProperties = base.properties as { name?: string } | undefined;
			const appendProperties = append.properties as { name?: string } | undefined;
			base.properties = {
				...(append.properties || {}),
				...(base.properties || {}),
				name: baseProperties?.name || appendProperties?.name || 'Route path'
			};
			data.paths?.features.splice(appendIndex, 1);
			for (const route of data.routes || []) {
				const refs = route.pathRefs || [];
				const hasBaseRef = refs.some((ref) => String(ref.pathId) === String(base.id));
				route.pathRefs = refs.flatMap((ref) => {
					if (String(ref.pathId) !== String(append.id)) return [ref];
					return hasBaseRef ? [] : [{ ...ref, pathId: String(base.id) }];
				});
			}
		});
		selectObject({
			type: 'route-path',
			documentPath: path,
			pathId: String(base.id),
			pathIndex: baseIndex
		});
		return true;
	}

	function updateRoutePath(path: string, routeId: Id, pathId: Id, patch: Partial<RoutePathRef>) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.map((pathRef) =>
				String(pathRef.pathId) === String(pathId) ? { ...pathRef, ...patch } : pathRef
			)
		);
	}

	function updateRoutePathFeature(
		path: string,
		pathId: Id | undefined,
		patch: RoutePathFeaturePatch
	) {
		if (pathId == null) return false;
		const document = documentAt(path);
		const feature = document ? findTopoPath(document.data, pathId) : null;
		if (!document || !feature) return false;
		updateDocument(path, () => {
			const properties: Record<string, unknown> = { ...(feature.properties || {}) };
			for (const [field, value] of Object.entries(patch)) {
				if (value == null || value === '') delete properties[field];
				else properties[field] = value;
			}
			feature.properties = properties;
		});
		return true;
	}

	function removeRoutePath(path: string, routeId: Id, pathId: Id) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.filter((ref) => String(ref.pathId) !== String(pathId))
		);
	}

	function deleteRoutePath(path: string, pathId: Id | undefined, pathIndex: number | null = null) {
		if (pathId == null) return false;
		const document = documentAt(path);
		const features = document?.data.paths?.features || [];
		const resolvedIndex =
			pathIndex !== null && Number.isInteger(pathIndex)
				? pathIndex
				: features.findIndex((item) => String(item.id) === String(pathId));
		const feature = features[resolvedIndex];
		if (!document || !feature || String(feature.id) !== String(pathId)) return false;
		updateDocument(path, (data) => {
			data.paths?.features.splice(resolvedIndex, 1);
			if (data.paths?.features.some((item) => String(item.id) === String(pathId))) return;
			for (const route of data.routes || [])
				route.pathRefs = (route.pathRefs || []).filter(
					(ref) => String(ref.pathId) !== String(pathId)
				);
		});
		const draft = getRouteDraft();
		const selection = getSelection();
		if (draft?.pathId === pathId && draft?.documentPath === path) cancelTrackEdit();
		if (
			selection?.type === 'route-path' &&
			selection.documentPath === path &&
			String(selection.pathId) === String(pathId) &&
			(selection.pathIndex == null || Number(selection.pathIndex) === resolvedIndex)
		)
			selectObject(null);
		return true;
	}

	return {
		addRoute,
		deleteRoute,
		selectRoute,
		updateRoute,
		addRoutePath,
		assignExistingRoutePath,
		createRoutePathFromAccess,
		moveApproachTrackToTopoPaths,
		saveRoutePathCoordinates,
		editRoutePath,
		duplicateRoutePath,
		concatRoutePaths,
		splitRoutePath,
		updateRoutePath,
		updateRoutePathFeature,
		removeRoutePath,
		deleteRoutePath
	};
}
