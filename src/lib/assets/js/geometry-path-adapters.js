import {
	insertPathVertex,
	isClosedPath,
	movePathVertex,
	normalizePath,
	removePathVertex,
	translatePath
} from '$lib/assets/js/path-geometry.js';

export function getGeometryPath(geometry) {
	if (geometry?.type === 'LineString') return geometry.coordinates || [];
	if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] || [];
	return [];
}

export function setGeometryPath(geometry, points) {
	if (geometry?.type === 'LineString') {
		return { ...geometry, coordinates: normalizePath(points, { closed: false }) };
	}
	if (geometry?.type === 'Polygon') {
		const rings = geometry.coordinates?.map((ring) => ring.map((point) => [...point])) || [[]];
		rings[0] = normalizePath(points, { closed: true });
		return { ...geometry, coordinates: rings };
	}
	return geometry;
}

export function moveGeometryVertex(geometry, index, position) {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		movePathVertex(getGeometryPath(geometry), index, position, { closed })
	);
}

export function insertGeometryVertex(geometry, index, position) {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		insertPathVertex(getGeometryPath(geometry), index, position, { closed })
	);
}

export function removeGeometryVertex(geometry, index) {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		removePathVertex(getGeometryPath(geometry), index, {
			closed,
			minPoints: closed ? 3 : 2
		})
	);
}

export function translateGeometryPath(geometry, delta) {
	const path = getGeometryPath(geometry);
	return setGeometryPath(geometry, translatePath(path, delta, { closed: isClosedPath(path) }));
}
