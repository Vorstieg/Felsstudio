import type { Point2D, PointOrAreaGeometry, Position } from '@vorstieg/fels-types/types';

function getRingCenter(rawRing: unknown): Point2D | null {
	if (!Array.isArray(rawRing)) return null;
	const ring = rawRing.filter(
		(point): point is Point2D => Array.isArray(point) && point.length >= 2
	);
	if (ring.length === 0) return null;
	const openRing =
		ring.length > 1 &&
		ring[0][0] === ring[ring.length - 1][0] &&
		ring[0][1] === ring[ring.length - 1][1]
			? ring.slice(0, -1)
			: ring;
	const sums = openRing.reduce<Point2D>(
		(acc, point) => [acc[0] + point[0], acc[1] + point[1]],
		[0, 0]
	);
	return [sums[0] / openRing.length, sums[1] / openRing.length];
}

export function getGeometryCenter(
	geometry: PointOrAreaGeometry | null | undefined
): Point2D | null {
	if (!geometry) return null;
	if (geometry.type === 'Point' && Array.isArray(geometry.coordinates))
		return [geometry.coordinates[0], geometry.coordinates[1]];
	if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
		return getRingCenter(geometry.coordinates[0]);
	}
	const multi = geometry as unknown as { type?: string; coordinates?: unknown[][][] };
	if (multi.type === 'MultiPolygon' && Array.isArray(multi.coordinates)) {
		let bestRing: unknown[] | null = null;
		for (const polygon of multi.coordinates) {
			const outer = Array.isArray(polygon?.[0]) ? polygon[0] : null;
			if (outer && (!bestRing || outer.length > bestRing.length)) bestRing = outer;
		}
		return getRingCenter(bestRing);
	}
	return null;
}

export function isAreaGeometry(
	geometry: PointOrAreaGeometry | { type?: string } | null | undefined
): boolean {
	return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

export function translateGeometryTo<T extends PointOrAreaGeometry | null | undefined>(
	geometry: T,
	center: Point2D | null | undefined
): T {
	const currentCenter = getGeometryCenter(geometry);
	if (!geometry || !currentCenter || !center) return geometry;
	const delta: Point2D = [center[0] - currentCenter[0], center[1] - currentCenter[1]];
	if (geometry.type === 'Point') return { ...geometry, coordinates: center };
	if (geometry.type === 'Polygon') {
		return {
			...geometry,
			coordinates: geometry.coordinates.map((ring) =>
				ring.map(([x, y, ...rest]): Position => [x + delta[0], y + delta[1], ...rest])
			)
		};
	}
	const multi = geometry as unknown as { type?: string; coordinates?: Position[][][] };
	if (multi.type === 'MultiPolygon' && Array.isArray(multi.coordinates)) {
		return {
			...geometry,
			coordinates: multi.coordinates.map((polygon) =>
				polygon.map((ring) =>
					ring.map(([x, y, ...rest]): Position => [x + delta[0], y + delta[1], ...rest])
				)
			)
		};
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
