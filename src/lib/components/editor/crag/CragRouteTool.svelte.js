import { generateId, generateRouteId } from '$lib/assets/js/id-utils.js';
import { Topo } from '$lib/assets/js/topo-paths.js';
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
		} while (
			state.routeDocuments.some((entry) =>
				(entry.data.routes || []).some((route) => route.id === routeId)
			)
		);

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
		const isDraftForRoute =
			draft?.documentPath === path && String(draft.routeId) === String(routeId);
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
		state.updateRoute(path, routeId, (current) => {
			current[field] = value;
		});
	}

	function updateRoutePaths(path, routeId, update) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document?.data.routes?.some((entry) => entry.id === routeId)) return;
		state.updateRoute(path, routeId, (current) => {
			current.pathRefs = update(current.pathRefs || []);
		});
	}

	function addRoutePath(path, routeId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		if (!document) return;
		let pathId;
		do {
			pathId = generateId('path');
		} while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		const pathIndex = document.data.paths.features.length;
		state.updateRouteDocument(path, (data) => {
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
		});
		updateRoutePaths(path, routeId, (refs) => [...refs, { pathId, role: 'main' }]);
		startRouteDraft({ documentPath: path, routeId, pathId, pathIndex });
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
		const access = state.access.features.find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		if (!document || !access?.geometry?.coordinates?.length) return false;
		document.data.paths = document.data.paths || { type: 'FeatureCollection', features: [] };
		let pathId;
		do {
			pathId = generateId('path');
		} while (document.data.paths.features.some((feature) => String(feature.id) === pathId));
		document.data.paths.features = [
			...document.data.paths.features,
			createPathFeature(
				access.geometry.coordinates,
				{ name: access.properties?.name || 'Copied access path' },
				pathId
			)
		];
		assignTopoPath(document.data, routeId, pathId, {
			role: 'approach',
			label: access.properties?.name || ''
		});
		state.markDocumentDirty(documentPath);
		return true;
	}

	function moveApproachTrackToTopoPaths(documentPath, accessFeatureId) {
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		const access = state.access.features.find(
			(feature) => feature.id === accessFeatureId && feature.properties?.kind === 'approach'
		);
		if (!document || !access?.geometry?.coordinates || access.geometry.coordinates.length < 2)
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
			document.dirty = true;
			state.access = {
				...state.access,
				features: state.access.features.filter((feature) => feature.id !== accessFeatureId)
			};
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
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		const feature = findPathFeature(document, pathId, pathIndex);
		if (!feature) return false;
		state.updateRouteDocument(documentPath, () => {
			feature.geometry = { type: 'LineString', coordinates };
		});
		return true;
	}

	function editRoutePath(path, routeId, pathId, pathIndex = null) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		const feature = findPathFeature(document, pathId, Number.isInteger(pathIndex) ? pathIndex : null);
		const coordinates = feature?.geometry?.coordinates;
		if (!Array.isArray(coordinates)) return;
		const resolvedPathIndex = (document?.data.paths?.features || []).indexOf(feature);
		startRouteDraft({ documentPath: path, routeId, pathId, pathIndex: resolvedPathIndex });
		editRoutePathTrack(coordinates);
	}

	function duplicateRoutePath(path, _routeId, pathId) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
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
		state.updateRouteDocument(path, (data) => {
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
		const document = state.routeDocuments.find((entry) => entry.path === documentPath);
		if (!document || !findTopoPath(document.data, pathId)) return false;
		if (
			!splitTopoPath(document.data, pathId, startCoordinates, endCoordinates, { mode, routeId })
				.length
		)
			return false;
		state.markDocumentDirty(documentPath);
		cancelTrackEdit();
		setActiveTool('position');
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
			{ distance: pointDistance(first.at(-1), second[0]), coordinates: [...first, ...second.slice(1)] },
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

	function concatRoutePaths(path, basePathId, appendPathId, basePathIndex = null, appendPathIndex = null) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		const features = document?.data.paths?.features || [];
		const baseIndex = Number.isInteger(basePathIndex)
			? basePathIndex
			: features.findIndex((feature) => String(feature.id) === String(basePathId));
		const appendIndex = Number.isInteger(appendPathIndex)
			? appendPathIndex
			: features.findIndex((feature, index) => index !== baseIndex && String(feature.id) === String(appendPathId));
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

		state.updateRouteDocument(path, (data) => {
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
		selectObject({ type: 'route-path', documentPath: path, pathId: String(base.id), pathIndex: baseIndex });
		return true;
	}

	function updateRoutePath(path, routeId, pathId, field, value) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.map((pathRef) =>
				String(pathRef.pathId) === String(pathId) ? { ...pathRef, [field]: value } : pathRef
			)
		);
	}

	function removeRoutePath(path, routeId, pathId) {
		updateRoutePaths(path, routeId, (paths) =>
			paths.filter((ref) => String(ref.pathId) !== String(pathId))
		);
	}

	function deleteRoutePath(path, pathId, pathIndex = null) {
		const document = state.routeDocuments.find((entry) => entry.path === path);
		const features = document?.data.paths?.features || [];
		const resolvedIndex = Number.isInteger(pathIndex)
			? pathIndex
			: features.findIndex((item) => String(item.id) === String(pathId));
		const feature = features[resolvedIndex];
		if (!document || !feature || String(feature.id) !== String(pathId)) return false;
		const routeRefs = (document.data.routes || [])
			.filter((route) =>
				(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
			)
			.map((route) => ({ id: route.id, pathRefs: JSON.parse(JSON.stringify(route.pathRefs)) }));
		features.splice(resolvedIndex, 1);
		const hasSameId = features.some((item) => String(item.id) === String(pathId));
		if (!hasSameId) {
			for (const route of document.data.routes || [])
				route.pathRefs = (route.pathRefs || []).filter(
					(ref) => String(ref.pathId) !== String(pathId)
				);
		}
		const deleted = true;
		if (deleted) {
			deletedRoutePathUndo = { path, feature: JSON.parse(JSON.stringify(feature)), routeRefs };
			document.dirty = true;
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
		moveApproachTrackToTopoPaths,
		saveRoutePathCoordinates,
		editRoutePath,
		duplicateRoutePath,
		concatRoutePaths,
		splitRoutePath,
		updateRoutePath,
		removeRoutePath,
		deleteRoutePath,
		undoDeleteRoutePath
	};
}
