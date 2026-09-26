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
} from '$lib/assets/js/topo-document-paths.js';

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
} = {}) {
	function documents() {
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
	function documentAt(path) {
		return documents().find((document) => document.path === path);
	}
	function updateDocument(path, updater) {
		const document = documentAt(path);
		return document
			? state.updateWorkspaceTopo(
					path,
					(topo) => updater(topo, document),
					state.getWorkspaceEntryPath(document.node)
				)
			: null;
	}
	function markDirty(path) {
		const document = documentAt(path);
		if (document) state.markWorkspaceDirty(path, state.getWorkspaceEntryPath(document.node));
	}

	function getRouteDocument(sectorId) {
		const active = state.getActiveWorkspaceEntry();
		const node = sectorId
			? active?.childEntries.find((child) => child.entry?.properties.id === sectorId)
			: active;
		return node?.topo ? documents().find((document) => document.node === node) : null;
	}

	function createRouteDocument(sectorId) {
		const active = state.getActiveWorkspaceEntry();
		const crag = active?.entry;
		const node = sectorId
			? active?.childEntries.find((child) => child.entry?.properties.id === sectorId)
			: active;
		const sectorPaths = workspaceDocumentPaths(
			node?.path || '',
			String(node?.entry?.properties.id || '')
		);
		return {
			path: sectorPaths.topo,
			node,
			data: {
				id: sectorId ? `${crag?.properties.id}:${sectorId}` : crag?.properties.id,
				crag_id: crag?.properties.id,
				sector_id: sectorId || '',
				name: sectorId || crag?.properties.name,
				routes: [],
				paths: { type: 'FeatureCollection', features: [] }
			},
			dirty: true
		};
	}

	function addRoute(sectorId = null) {
		let document = getRouteDocument(sectorId);
		if (!document) {
			document = createRouteDocument(sectorId);
			if (!document.node) return;
			document.node.topo = document.data;
			state.markWorkspaceDirty(document.path, state.getWorkspaceEntryPath(document.node));
		}

		let routeId;
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

	function deleteRoute(path, routeId) {
		const document = documentAt(path);
		if (!document) return;
		const routeKey = `${path}:${routeId}`;
		const selection = getSelection();
		const isSelectedRoute = selection?.type === 'route' && selection.key === routeKey;
		const draft = getRouteDraft();
		const isDraftForRoute =
			draft?.documentPath === path && String(draft.routeId) === String(routeId);
		if (isDraftForRoute) cancelTrackEdit();
		updateDocument(path, (data) => {
			data.routes = (data.routes || []).filter((route) => String(route.id) !== String(routeId));
		});
		if (isSelectedRoute || isDraftForRoute) selectObject(null);
	}

	function selectRoute(path, routeId) {
		selectObject({ type: 'route', key: `${path}:${routeId}` });
	}

	function updateRoute(path, routeId, field, value) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => {
			current[field] = value;
		});
	}

	function updateRoutePaths(path, routeId, update) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => {
			current.pathRefs = update(current.pathRefs || []);
		});
	}

	function addRoutePath(path, routeId) {
		const document = documentAt(path);
		if (!document?.data.routes?.some((route) => String(route.id) === String(routeId))) return;
		let pathId;
		do {
			pathId = generateId('path');
		} while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		const pathIndex = document.data.paths.features.length;
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
			];
			const route = data.routes.find((item) => String(item.id) === String(routeId));
			route.pathRefs = [...(route.pathRefs || []), { pathId, role: 'main' }];
		});
		startRouteDraft({ documentPath: path, routeId, pathId, pathIndex });
		startRoutingDraft();
	}

	function assignExistingRoutePath(path, routeId, pathId, role = 'main', label = '') {
		const document = documentAt(path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		let assigned = false;
		state.commit('Assign route path', () => {
			assigned = assignTopoPath(document.data, routeId, pathId, { role, label });
			if (assigned) markDirty(path);
		});
		return assigned;
	}

	function createRoutePathFromAccess(documentPath, routeId, accessFeatureId) {
		const document = documentAt(documentPath);
		const access = (state.getWorkspaceAccess()?.features || []).find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		if (!document || !access?.geometry?.coordinates?.length) return false;
		let pathId;
		do {
			pathId = generateId('path');
		} while (document.data.paths?.features?.some((feature) => String(feature.id) === pathId));
		updateDocument(documentPath, (data) => {
			data.paths = data.paths || { type: 'FeatureCollection', features: [] };
			data.paths.features = [
				...data.paths.features,
				createPathFeature(
					access.geometry.coordinates,
					{ name: access.properties?.name || 'Copied access path' },
					pathId
				)
			];
			assignTopoPath(data, routeId, pathId, {
				role: 'approach',
				label: access.properties?.name || ''
			});
		});
		return true;
	}

	function moveApproachTrackToTopoPaths(documentPath, accessFeatureId) {
		const document = documentAt(documentPath);
		const accessNode = state.getActiveWorkspaceEntry();
		const accessDocument = state.getWorkspaceAccess();
		const access = (accessDocument?.features || []).find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		if (
			!document ||
			!accessNode?.entry ||
			!access?.geometry?.coordinates ||
			access.geometry.coordinates.length < 2
		)
			return false;

		let pathId;
		do {
			pathId = generateId('path');
		} while (document.data.paths?.features?.some((feature) => String(feature.id) === pathId));

		state.commit('Move approach track to topo paths', () => {
			document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
			document.data.paths.features = [
				...document.data.paths.features,
				createPathFeature(
					access.geometry.coordinates,
					{ name: access.properties?.name || 'Approach track' },
					pathId
				)
			];
			markDirty(documentPath);
			accessDocument.features = accessDocument.features.filter(
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

	function findPathFeature(document, pathId, pathIndex = null) {
		const features = document?.data.paths?.features || [];
		if (Number.isInteger(pathIndex) && String(features[pathIndex]?.id) === String(pathId))
			return features[pathIndex];
		return features.find((item) => String(item.id) === String(pathId));
	}

	function saveRoutePathCoordinates({ documentPath, pathId, pathIndex }, coordinates) {
		const document = documentAt(documentPath);
		const feature = findPathFeature(document, pathId, pathIndex);
		if (!feature) return false;
		updateDocument(documentPath, () => {
			feature.geometry = { type: 'LineString', coordinates };
		});
		return true;
	}

	function editRoutePath(path, routeId, pathId, pathIndex = null) {
		const document = documentAt(path);
		const feature = findPathFeature(
			document,
			pathId,
			Number.isInteger(pathIndex) ? pathIndex : null
		);
		const coordinates = feature?.geometry?.coordinates;
		if (!Array.isArray(coordinates)) return;
		const resolvedPathIndex = (document?.data.paths?.features || []).indexOf(feature);
		startRouteDraft({ documentPath: path, routeId, pathId, pathIndex: resolvedPathIndex });
		editRoutePathTrack(coordinates);
	}

	function duplicateRoutePath(path, _routeId, pathId) {
		const document = documentAt(path);
		const feature = document ? findTopoPath(document.data, pathId) : null;
		if (!document || !feature) return false;
		let duplicatePathId;
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
		{ documentPath, pathId, routeId },
		startCoordinates,
		endCoordinates,
		mode = 'shared'
	) {
		if (startCoordinates.length < 2 || endCoordinates.length < 2) return false;
		const document = documentAt(documentPath);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		let split = false;
		state.commit('Split route path', () => {
			split =
				splitTopoPath(document.data, pathId, startCoordinates, endCoordinates, { mode, routeId })
					.length > 0;
			if (split) markDirty(documentPath);
		});
		if (!split) return false;
		cancelTrackEdit();
		setActiveTool('geometry');
		return true;
	}

	function pointDistance(a, b) {
		if (!a || !b) return Infinity;
		return Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]));
	}

	function orientConcatCoordinates(firstCoordinates, secondCoordinates) {
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
		path,
		basePathId,
		appendPathId,
		basePathIndex = null,
		appendPathIndex = null
	) {
		const document = documentAt(path);
		const features = document?.data.paths?.features || [];
		const baseIndex = Number.isInteger(basePathIndex)
			? basePathIndex
			: features.findIndex((feature) => String(feature.id) === String(basePathId));
		const appendIndex = Number.isInteger(appendPathIndex)
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
				coordinates: orientConcatCoordinates(base.geometry.coordinates, append.geometry.coordinates)
			};
			base.properties = {
				...(append.properties || {}),
				...(base.properties || {}),
				name: base.properties?.name || append.properties?.name || 'Route path'
			};
			data.paths.features.splice(appendIndex, 1);
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

	function updateRoutePath(path, routeId, pathId, field, value) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.map((pathRef) =>
				String(pathRef.pathId) === String(pathId) ? { ...pathRef, [field]: value } : pathRef
			)
		);
	}

	function updateRoutePathFeature(path, pathId, field, value) {
		const document = documentAt(path);
		const feature = document ? findTopoPath(document.data, pathId) : null;
		if (!document || !feature) return false;
		updateDocument(path, () => {
			feature.properties = { ...(feature.properties || {}) };
			if (value == null || value === '') delete feature.properties[field];
			else feature.properties[field] = value;
		});
		return true;
	}

	function removeRoutePath(path, routeId, pathId) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.filter((ref) => String(ref.pathId) !== String(pathId))
		);
	}

	function deleteRoutePath(path, pathId, pathIndex = null) {
		const document = documentAt(path);
		const features = document?.data.paths?.features || [];
		const resolvedIndex = Number.isInteger(pathIndex)
			? pathIndex
			: features.findIndex((item) => String(item.id) === String(pathId));
		const feature = features[resolvedIndex];
		if (!document || !feature || String(feature.id) !== String(pathId)) return false;
		updateDocument(path, (data) => {
			data.paths.features.splice(resolvedIndex, 1);
			if (data.paths.features.some((item) => String(item.id) === String(pathId))) return;
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
