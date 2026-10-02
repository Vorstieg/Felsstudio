import {
	insertPathVertex,
	isClosedPath,
	movePathVertex,
	normalizePath,
	removePathVertex,
	translatePath
} from '$lib/assets/js/path-geometry.ts';
import type { Path2D, Point2D } from '$lib/assets/js/path-geometry.ts';
import type { PointOrAreaGeometry, Position } from '@vorstieg/fels-types/types';

type LineGeometry = { type: 'LineString'; coordinates: Position[] };
type EditableGeometry = LineGeometry | PointOrAreaGeometry;

export function getGeometryPath(geometry: EditableGeometry | null | undefined): Path2D {
	if (geometry?.type === 'LineString') return (geometry.coordinates || []) as Path2D;
	if (geometry?.type === 'Polygon') return (geometry.coordinates?.[0] || []) as unknown as Path2D;
	return [];
}

export function setGeometryPath<T extends EditableGeometry | null | undefined>(
	geometry: T,
	points: Path2D
): T {
	if (geometry?.type === 'LineString') {
		return { ...geometry, coordinates: normalizePath(points, { closed: false }) } as T;
	}
	if (geometry?.type === 'Polygon') {
		const rings: Path2D[] = geometry.coordinates?.map((ring) =>
			ring.map((point) => [...point] as Point2D)
		) || [[]];
		rings[0] = normalizePath(points, { closed: true });
		return { ...geometry, coordinates: rings } as T;
	}
	return geometry;
}

export function moveGeometryVertex<T extends EditableGeometry | null | undefined>(
	geometry: T,
	index: number,
	position: Point2D
): T {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		movePathVertex(getGeometryPath(geometry), index, position, { closed })
	);
}

export function insertGeometryVertex<T extends EditableGeometry | null | undefined>(
	geometry: T,
	index: number,
	position: Point2D
): T {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		insertPathVertex(getGeometryPath(geometry), index, position, { closed })
	);
}

export function removeGeometryVertex<T extends EditableGeometry | null | undefined>(
	geometry: T,
	index: number
): T {
	const closed = geometry?.type === 'Polygon';
	return setGeometryPath(
		geometry,
		removePathVertex(getGeometryPath(geometry), index, {
			closed,
			minPoints: closed ? 3 : 2
		})
	);
}

export function translateGeometryPath<T extends EditableGeometry | null | undefined>(
	geometry: T,
	delta: Point2D
): T {
	const path = getGeometryPath(geometry);
	return setGeometryPath(geometry, translatePath(path, delta, { closed: isClosedPath(path) }));
}
