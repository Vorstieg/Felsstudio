import { pointsEqual, translatePath } from '$lib/assets/js/path-geometry.js';

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
