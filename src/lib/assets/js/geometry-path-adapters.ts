import { isLinePath } from '$lib/assets/js/path-geometry.ts';
import type { Point2D, PointOrAreaGeometry, Position } from '@vorstieg/fels-types/types';

type LineGeometry = { type: 'LineString'; coordinates: Position[] };
type EditableGeometry = LineGeometry | PointOrAreaGeometry;

export function getGeometryPath(geometry: EditableGeometry | null | undefined): Point2D[] {
	const coordinates =
		geometry?.type === 'LineString'
			? geometry.coordinates
			: geometry?.type === 'Polygon'
				? geometry.coordinates[0]
				: [];
	return coordinates.map(([x, y]): Point2D => [x, y]);
}

export function editGeometryPath<T extends EditableGeometry | null | undefined>(
	geometry: T,
	edit: (path: Point2D[], closed: boolean) => Point2D[]
): T {
	const path = getGeometryPath(geometry);
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
	return { ...geometry, coordinates: edit(path, false) };
}
