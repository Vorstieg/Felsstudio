import { generateId } from './id-utils.js';

export const EMPTY_PATHS = Object.freeze({ type: 'FeatureCollection', features: [] });

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stablePathId(asset, index) {
	if (asset?.id != null && String(asset.id).trim()) return String(asset.id);
	const source = `${asset?.label || asset?.role || 'path'}-${index}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `path-${source || index + 1}`;
}

export function isLineStringPath(feature) {
	return (
		feature?.type === 'Feature' &&
		feature.geometry?.type === 'LineString' &&
		Array.isArray(feature.geometry.coordinates) &&
		feature.geometry.coordinates.length >= 2 &&
		feature.geometry.coordinates.every(
			(point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)
		)
	);
}

export function createPathFeature(coordinates, metadata = {}, id = generateId('path')) {
	return {
		type: 'Feature',
		id: String(id),
		properties: { ...(metadata || {}) },
		geometry: {
			type: 'LineString',
			coordinates: (coordinates || []).map((point) => [Number(point[0]), Number(point[1])])
		}
	};
}

export function normalizeTopoPaths(data = {}) {
	let migrated = false;
	const next = clone(data) || {};
	const existing = next.paths;
	if (!existing || existing.type !== 'FeatureCollection' || !Array.isArray(existing.features)) {
		next.paths = { type: 'FeatureCollection', features: [] };
		migrated = true;
	} else {
		next.paths = {
			...existing,
			features: existing.features.map((feature, index) => ({
				...feature,
				id: String(feature.id ?? `path-${index + 1}`),
				properties: { ...(feature.properties || {}) }
			}))
		};
	}

	for (const route of Array.isArray(next.routes) ? next.routes : []) {
		const legacy = route.assets?.paths;
		if (legacy == null) {
			if (!Array.isArray(route.pathRefs)) {
				route.pathRefs = [];
				migrated = true;
			}
			continue;
		}
		const entries = Array.isArray(legacy) ? legacy : [legacy];
		const refs = Array.isArray(route.pathRefs) ? route.pathRefs : [];
		entries.forEach((asset, index) => {
			if (!asset?.path || asset.path.type !== 'LineString') return;
			const pathId = stablePathId(asset, next.paths.features.length + index);
			let feature = next.paths.features.find((item) => String(item.id) === pathId);
			if (!feature) {
				feature = createPathFeature(asset.path.coordinates, { name: asset.label || asset.role || 'Route path' }, pathId);
				next.paths.features.push(feature);
			}
			if (!refs.some((ref) => String(ref.pathId) === pathId)) {
				refs.push({ pathId, role: asset.role || 'main', ...(asset.label ? { label: asset.label } : {}) });
			}
		});
		route.pathRefs = refs;
		if (route.assets && Object.prototype.hasOwnProperty.call(route.assets, 'paths')) {
			const { paths, ...assets } = route.assets;
			route.assets = assets;
		}
		migrated = true;
	}
	return { data: next, migrated };
}

export function ensureTopoPaths(data) {
	const result = normalizeTopoPaths(data);
	return result.data.paths;
}

export function findTopoPath(data, pathId) {
	return ensureTopoPaths(data).features.find((feature) => String(feature.id) === String(pathId)) || null;
}

export function assignTopoPath(data, routeId, pathId, { role = 'main', label = '' } = {}) {
	const path = findTopoPath(data, pathId);
	const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
	if (!path || !route) throw new Error('Path and route must belong to the same topo document.');
	route.pathRefs = Array.isArray(route.pathRefs) ? route.pathRefs : [];
	if (route.pathRefs.some((ref) => String(ref.pathId) === String(pathId))) return false;
	route.pathRefs.push({ pathId: String(path.id), role, ...(label ? { label } : {}) });
	return true;
}

export function unassignTopoPath(data, routeId, pathId) {
	const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
	if (!route) return false;
	const refs = Array.isArray(route.pathRefs) ? route.pathRefs : [];
	const next = refs.filter((ref) => String(ref.pathId) !== String(pathId));
	route.pathRefs = next;
	return next.length !== refs.length;
}

export function routesUsingTopoPath(data, pathId) {
	return (data.routes || []).filter((route) =>
		(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
	);
}

export function updateTopoPath(data, pathId, coordinates, metadata) {
	const path = findTopoPath(data, pathId);
	if (!path) return false;
	path.geometry = { type: 'LineString', coordinates: clone(coordinates) };
	if (metadata) path.properties = { ...(path.properties || {}), ...metadata };
	return true;
}

export function deleteTopoPath(data, pathId) {
	const paths = ensureTopoPaths(data);
	const before = paths.features.length;
	paths.features = paths.features.filter((feature) => String(feature.id) !== String(pathId));
	for (const route of data.routes || []) route.pathRefs = (route.pathRefs || []).filter((ref) => String(ref.pathId) !== String(pathId));
	return paths.features.length !== before;
}

export function splitTopoPath(data, pathId, startCoordinates, endCoordinates, { mode = 'shared', routeId } = {}) {
	const path = findTopoPath(data, pathId);
	if (!path || startCoordinates?.length < 2 || endCoordinates?.length < 2) return [];
	if (mode === 'route-specific') {
		const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
		if (!route || !(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))) return [];
		const firstId = `${pathId}-1`;
		const secondId = `${pathId}-2`;
		data.paths.features.push(
			{ ...clone(path), id: firstId, geometry: { type: 'LineString', coordinates: clone(startCoordinates) } },
			{ ...clone(path), id: secondId, geometry: { type: 'LineString', coordinates: clone(endCoordinates) } }
		);
		route.pathRefs = route.pathRefs.flatMap((ref) =>
			String(ref.pathId) === String(pathId) ? [{ ...ref, pathId: firstId }, { ...ref, pathId: secondId }] : [ref]
		);
		return [firstId, secondId];
	}
	path.geometry = { type: 'LineString', coordinates: clone(startCoordinates) };
	const secondId = `${pathId}-2`;
	data.paths.features.push({ ...clone(path), id: secondId, geometry: { type: 'LineString', coordinates: clone(endCoordinates) } });
	for (const route of data.routes || []) {
		if ((route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))) route.pathRefs.push(...(route.pathRefs.filter((ref) => String(ref.pathId) === String(pathId)).map((ref) => ({ ...ref, pathId: secondId }))));
	}
	return [String(pathId), secondId];
}

export function validateTopoPaths(data) {
	const paths = ensureTopoPaths(data);
	const ids = new Set();
	const errors = [];
	for (const feature of paths.features) {
		if (!feature.id || ids.has(String(feature.id))) errors.push(`Invalid or duplicate path id: ${feature.id}`);
		ids.add(String(feature.id));
		if (!isLineStringPath(feature)) errors.push(`Path ${feature.id} must be a valid LineString feature.`);
	}
	for (const route of data.routes || []) for (const ref of route.pathRefs || []) {
		if (!ids.has(String(ref.pathId))) errors.push(`Route ${route.id} references missing path ${ref.pathId}.`);
	}
	return errors;
}
