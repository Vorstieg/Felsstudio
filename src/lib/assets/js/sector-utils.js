import { pointsEqual, translatePath } from '$lib/assets/js/path-geometry.js';

export function pathDirname(path = '') {
	const parts = String(path).split('/').filter(Boolean);
	return parts.slice(0, -1).join('/');
}

export function pathBasename(path = '') {
	return String(path).split('/').filter(Boolean).at(-1) || '';
}

export function normalizeEntryPath(path = '') {
	return String(path)
		.replace(/^\/?(src\/)?entries\//, '')
		.split('/')
		.filter(Boolean)
		.join('/');
}

export function pathsReferToSameEntry(a = '', b = '') {
	const left = normalizeEntryPath(a);
	const right = normalizeEntryPath(b);
	if (!left || !right) return false;
	return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

export function resolveEntryPath(parentPath = '', childPath = '', fallbackId = '') {
	const parent = normalizeEntryPath(parentPath);
	const child = normalizeEntryPath(childPath);
	const fallback = normalizeEntryPath(fallbackId);

	if (!child) return [parent, fallback].filter(Boolean).join('/');
	if (!parent) return child;
	if (child === parent || child.startsWith(`${parent}/`)) return child;
	if (!child.includes('/')) return [parent, child].join('/');

	const childParent = pathDirname(child);
	if (pathsReferToSameEntry(parent, childParent)) {
		return [parent, pathBasename(child)].filter(Boolean).join('/');
	}

	return child;
}

export function isSectorFeature(feature) {
	const properties = feature?.properties || {};
	return properties.kind === 'sector' || Boolean(properties.parent_id || properties.parent_path);
}

export function getSectorEntryPath(parentPath, sector = {}) {
	if (!sector) return parentPath;
	return resolveEntryPath(parentPath, sector.path, sector.id);
}

export function normalizeSectorFeature(feature, filePath = '') {
	const properties = { ...(feature?.properties || {}) };
	const derivedPath = filePath
		? pathDirname(normalizeEntryPath(filePath))
		: normalizeEntryPath(properties.path);
	const id = properties.id || pathBasename(derivedPath);
	const parentPath = normalizeEntryPath(properties.parent_path || pathDirname(derivedPath));

	return {
		...properties,
		id,
		kind: 'sector',
		parent_path: parentPath,
		path: normalizeEntryPath(properties.path || derivedPath),
		geometry: feature?.geometry || properties.geometry || { type: 'Point', coordinates: [0, 0] },
		topo: properties.topo || { site: '', link: '' },
		assets: normalizeSectorAssets(properties.assets)
	};
}

export function normalizeSectorAssets(assets = {}) {
	const normalized = { ...assets };
	normalized.topos = normalizeAssetList(normalized.topos ?? normalized.topo);
	normalized.models = normalizeAssetList(normalized.models ?? normalized.model);
	normalized.images = normalizeAssetList(normalized.images ?? normalized.image);
	normalized.approaches = normalizeAssetList(normalized.approaches ?? normalized.approach);
	return normalized;
}

export function normalizeAssetList(value) {
	if (!value) return [];
	return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function sectorToFeature(sector, parentId, parentPath) {
	const { geometry, ...properties } = sector;
	return {
		type: 'Feature',
		properties: {
			...properties,
			kind: 'sector',
			parent_id: sector.parent_id || parentId,
			parent_path: sector.parent_path || parentPath
		},
		geometry: geometry || { type: 'Point', coordinates: [0, 0] }
	};
}

export function getGeometryCenter(geometry) {
	if (!geometry) return null;
	if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
	if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
		const ring = geometry.coordinates[0].filter(
			(point) => Array.isArray(point) && point.length >= 2
		);
		if (ring.length === 0) return null;
		const openRing =
			ring.length > 1 && pointsEqual(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
		const sums = openRing.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
		return [sums[0] / openRing.length, sums[1] / openRing.length];
	}
	return null;
}

export function translateGeometryTo(geometry, center) {
	const currentCenter = getGeometryCenter(geometry);
	if (!currentCenter || !center) return geometry;
	const delta = [center[0] - currentCenter[0], center[1] - currentCenter[1]];
	if (geometry.type === 'Point') return { ...geometry, coordinates: center };
	if (geometry.type === 'Polygon') {
		return {
			...geometry,
			coordinates: geometry.coordinates.map((ring) => translatePath(ring, delta))
		};
	}
	return geometry;
}

export function createPolygonAround(center, size = 0.00025) {
	const [lng, lat] = center;
	return {
		type: 'Polygon',
		coordinates: [
			[
				[lng - size, lat - size],
				[lng + size, lat - size],
				[lng + size, lat + size],
				[lng - size, lat + size],
				[lng - size, lat - size]
			]
		]
	};
}
