import { pointsEqual, translatePath } from '$lib/assets/js/path-geometry.ts';
import type { Path2D, Point2D } from '$lib/assets/js/path-geometry.ts';
import type { PointOrAreaGeometry } from '@vorstieg/fels-types/types';

export function getGeometryCenter(
	geometry: PointOrAreaGeometry | null | undefined
): Point2D | null {
	if (!geometry) return null;
	if (geometry.type === 'Point' && Array.isArray(geometry.coordinates))
		return [geometry.coordinates[0], geometry.coordinates[1]];
	if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
		const ring = geometry.coordinates[0].filter(
			(point) => Array.isArray(point) && point.length >= 2
		);
		if (ring.length === 0) return null;
		const openRing =
			ring.length > 1 &&
			pointsEqual([ring[0][0], ring[0][1]], [ring[ring.length - 1][0], ring[ring.length - 1][1]])
				? ring.slice(0, -1)
				: ring;
		const sums = openRing.reduce<Point2D>(
			(acc, point) => [acc[0] + point[0], acc[1] + point[1]],
			[0, 0]
		);
		return [sums[0] / openRing.length, sums[1] / openRing.length];
	}
	return null;
}

export function translateGeometryTo<T extends PointOrAreaGeometry | null | undefined>(
	geometry: T,
	center: Point2D | null | undefined
): T {
	const currentCenter = getGeometryCenter(geometry);
	if (!geometry || !currentCenter || !center) return geometry;
	const delta: Point2D = [center[0] - currentCenter[0], center[1] - currentCenter[1]];
	if (geometry.type === 'Point') return { ...geometry, coordinates: center } as T;
	if (geometry.type === 'Polygon') {
		return {
			...geometry,
			coordinates: geometry.coordinates.map((ring) =>
				translatePath(ring as unknown as Path2D, delta)
			)
		} as T;
	}
	return geometry;
}

export function createPolygonAround(center: Point2D, size = 0.00025): PointOrAreaGeometry {
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
