import { generateId, generateRouteId } from '$lib/assets/js/id-utils.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
import {
	assignTopoPath,
	createPathFeature,
	deleteTopoPath,
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
	let deletedRoutePathUndo = null;

	function getRouteDocument(sectorId) {
		return state.routeDocuments.find((document) => document.sectorId === sectorId);
	}

	function createRouteDocument(sectorId) {
		const sectorTopo = new Topo(state.crag.path, state.crag.id, sectorId || undefined);
		return {
			path: sectorTopo.getTopoPath(),
			sectorId,
			data: {
				id: sectorId ? `${state.crag.id}:${sectorId}` : state.crag.id,
				crag_id: state.crag.id,
				sector_id: sectorId || '',
				name: sectorId || state.crag.name,
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
			state.addRouteDocument(document);
		}

		let routeId;
		do {
			routeId = generateRouteId();
		} while (state.routeDocuments.some((entry) => (entry.data.routes || []).some((route) => route.id === routeId)));

		const route = { id: routeId, name: '', type: 'sports-climbing', tags: [], pathRefs: [] };
		state.updateRouteDocument(document.path, (data) => {
			data.routes = [...(data.routes || []), route];
		});
		selectObject({ type: 'route', key: `${document.path}:${route.id}` });
	}

	function deleteRoute(path, routeId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document) return;
		const routeKey = `${path}:${routeId}`;
		const selection = getSelection();
		const isSelectedRoute = selection?.type === 'route' && selection.key === routeKey;
		const draft = getRouteDraft();
		const isDraftForRoute = draft?.documentPath === path && String(draft.routeId) === String(routeId);
		if (isDraftForRoute) cancelTrackEdit();
		state.updateRouteDocument(path, (data) => {
			data.routes = (data.routes || []).filter((route) => String(route.id) !== String(routeId));
		});
		if (isSelectedRoute || isDraftForRoute) selectObject(null);
	}

	function selectRoute(path, routeId) {
		selectObject({ type: 'route', key: `${path}:${routeId}` });
	}

	function updateRoute(path, routeId, field, value) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => { current[field] = value; });
	}

	function updateRoutePaths(path, routeId, update) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => { current.pathRefs = update(current.pathRefs || []); });
	}

	function addRoutePath(path, routeId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document) return;
		let pathId;
		do { pathId = generateId('path'); } while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		state.updateRouteDocument(path, (data) => {
			data.paths = data.paths || { type: 'FeatureCollection', features: [] };
			data.paths.features = [...data.paths.features, { type: 'Feature', id: pathId, properties: { name: 'Route path' }, geometry: { type: 'LineString', coordinates: [] } }];
		});
		updateRoutePaths(path, routeId, (refs) => [...refs, { pathId, role: 'main' }]);
		startRouteDraft({ documentPath: path, routeId, pathId });
		startRoutingDraft();
	}

	function assignExistingRoutePath(path, routeId, pathId, role = 'main', label = '') {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		const assigned = assignTopoPath(document.data, routeId, pathId, { role, label });
		if (assigned) state.markDocumentDirty(path);
		return assigned;
	}

	function createRoutePathFromAccess(documentPath, routeId, accessFeatureId) {
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		const access = state.access.features.find((feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach');
		if (!document || !access?.geometry?.coordinates?.length) return false;
		document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
		let pathId;
		do { pathId = generateId('path'); } while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		document.data.paths.features = [...document.data.paths.features, createPathFeature(access.geometry.coordinates, { name: access.properties?.name || 'Copied access path' }, pathId)];
		assignTopoPath(document.data, routeId, pathId, { role: 'approach', label: access.properties?.name || '' });
		state.markDocumentDirty(documentPath);
		return true;
	}

	function saveRoutePathCoordinates({ documentPath, pathId }, coordinates) {
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		const feature = document?.data.paths?.features?.find((item) => String(item.id) === String(pathId));
		if (!feature) return false;
		state.updateRouteDocument(documentPath, () => {
			feature.geometry = { type: 'LineString', coordinates };
		});
		return true;
	}

	function editRoutePath(path, routeId, pathId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		const coordinates = document?.data.paths?.features?.find((feature) => String(feature.id) === String(pathId))?.geometry?.coordinates;
		if (!Array.isArray(coordinates)) return;
		startRouteDraft({ documentPath: path, routeId, pathId });
		editRoutePathTrack(coordinates);
	}

	function splitRoutePath({ documentPath, pathId, routeId }, startCoordinates, endCoordinates, mode = 'shared') {
		if (startCoordinates.length < 2 || endCoordinates.length < 2) return false;
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		if (!splitTopoPath(document.data, pathId, startCoordinates, endCoordinates, { mode, routeId }).length) return false;
		state.markDocumentDirty(documentPath);
		cancelTrackEdit();
		setActiveTool('position');
		return true;
	}

	function updateRoutePath(path, routeId, pathId, field, value) {
		updateRoutePaths(path, routeId, (paths) => paths.map((pathRef) =>
			String(pathRef.pathId) === String(pathId) ? { ...pathRef, [field]: value } : pathRef
		));
	}

	function removeRoutePath(path, routeId, pathId) {
		updateRoutePaths(path, routeId, (paths) => paths.filter((ref) => String(ref.pathId) !== String(pathId)));
	}

	function deleteRoutePath(path, pathId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		const feature = findTopoPath(document.data, pathId);
		const routeRefs = (document.data.routes || [])
			.filter((route) => (route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId)))
			.map((route) => ({ id: route.id, pathRefs: JSON.parse(JSON.stringify(route.pathRefs)) }));
		const deleted = deleteTopoPath(document.data, pathId);
		if (deleted) {
			deletedRoutePathUndo = { path, feature: JSON.parse(JSON.stringify(feature)), routeRefs };
			document.dirty = true;
			const draft = getRouteDraft();
			if (draft?.pathId === pathId && draft?.documentPath === path) cancelTrackEdit();
		}
		return deleted;
	}

	function undoDeleteRoutePath() {
		const undo = deletedRoutePathUndo;
		if (!undo) return false;
		const document = state.routeDocuments.find((entry) => entry.path === undo.path);
		if (!document || findTopoPath(document.data, undo.feature.id)) return false;
		document.data.paths.features = [...(document.data.paths?.features || []), undo.feature];
		for (const savedRoute of undo.routeRefs) {
			const route = document.data.routes?.find((item) => String(item.id) === String(savedRoute.id));
			if (route) route.pathRefs = savedRoute.pathRefs;
		}
		document.dirty = true;
		deletedRoutePathUndo = null;
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
		saveRoutePathCoordinates,
		editRoutePath,
		splitRoutePath,
		updateRoutePath,
		removeRoutePath,
		deleteRoutePath,
		undoDeleteRoutePath
	};
}
