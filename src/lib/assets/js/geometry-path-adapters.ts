import { isLinePath } from '$lib/assets/js/path-geometry.ts';
import type { Point2D, PointOrAreaGeometry, Position } from '@vorstieg/fels-types/types';

type LineGeometry = { type: 'LineString'; coordinates: Position[] };
type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
type EditableGeometry = LineGeometry | PointOrAreaGeometry | MultiPolygonGeometry;

export function getGeometryPath(
	geometry: EditableGeometry | null | undefined,
	polygonIndex = 0
): Point2D[] {
	const multi = geometry as unknown as MultiPolygonGeometry | null | undefined;
	const coordinates =
		geometry?.type === 'LineString'
			? geometry.coordinates
			: geometry?.type === 'Polygon'
				? geometry.coordinates[0]
				: multi?.type === 'MultiPolygon' && Array.isArray(multi.coordinates?.[polygonIndex]?.[0])
					? multi.coordinates[polygonIndex][0]
					: [];
	return coordinates.map(([x, y]): Point2D => [x, y]);
}

export function editGeometryPath<T extends EditableGeometry | null | undefined>(
	geometry: T,
	edit: (path: Point2D[], closed: boolean) => Point2D[],
	polygonIndex = 0
): T {
	const path = getGeometryPath(geometry, polygonIndex);
	if (!isLinePath(path)) return geometry;
	if (geometry?.type === 'Polygon') {
		const points = edit(path, true);
		return {
			...geometry,
			coordinates: [
				[points[0], points[1], points[2], points[3], ...points.slice(4)],
				...geometry.coordinates.slice(1)
			]
		};
	}
	const multi = geometry as unknown as MultiPolygonGeometry | null | undefined;
	if (multi?.type === 'MultiPolygon' && Array.isArray(multi.coordinates?.[polygonIndex])) {
		const points = edit(path, true);
		const targetPolygon = multi.coordinates[polygonIndex];
		return {
			...geometry,
			coordinates: multi.coordinates.map((polygon, index) =>
				index === polygonIndex
					? [
							[points[0], points[1], points[2], points[3], ...points.slice(4)],
							...targetPolygon.slice(1)
						]
					: polygon
			)
		};
	}
	return { ...geometry, coordinates: edit(path, false) };
}
