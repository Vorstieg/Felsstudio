import type { Point2D } from '@vorstieg/fels-types/types';

/** Closed paths repeat the first vertex at the end; `closed: false` treats both as separate vertices. */
type PathOptions = { closed?: boolean };

/** Narrow a completed line to the shared document's two-point minimum. */
export function isLinePath<T>(points: T[]): points is [T, T, ...T[]] {
	return points.length >= 2;
}

export function isClosedPath(points: Point2D[]): boolean {
	return (
		points.length > 1 &&
		points[0][0] === points[points.length - 1][0] &&
		points[0][1] === points[points.length - 1][1]
	);
}

export function closePath(points: Point2D[]): Point2D[] {
	return points.length && !isClosedPath(points) ? [...points, points[0]] : points;
}

export function getEditablePath(
	points: Point2D[],
	{ closed = isClosedPath(points) }: PathOptions = {}
): Point2D[] {
	return points.slice(0, closed && isClosedPath(points) ? -1 : points.length);
}

export function movePathVertex(
	points: Point2D[],
	index: number,
	position: Point2D,
	{ closed = isClosedPath(points) }: PathOptions = {}
): Point2D[] {
	const next = (closed ? closePath(points) : points).slice();
	const vertexCount = closed && next.length ? next.length - 1 : next.length;
	const vertexIndex = closed && index === vertexCount ? 0 : index;
	if (vertexIndex >= 0 && vertexIndex < vertexCount) {
		next[vertexIndex] = position;
		if (closed && vertexIndex === 0) next[vertexCount] = position;
	}
	return next;
}

export function insertPathVertex(
	points: Point2D[],
	index: number,
	position: Point2D,
	{ closed = isClosedPath(points) }: PathOptions = {}
): Point2D[] {
	const next = (closed ? closePath(points) : points).slice();
	const vertexCount = closed && next.length ? next.length - 1 : next.length;
	next.splice(Math.max(0, Math.min(index, vertexCount)), 0, position);
	if (closed) {
		if (next.length === 1) next.push(position);
		else next[next.length - 1] = next[0];
	}
	return next;
}

export function removePathVertex(
	points: Point2D[],
	index: number,
	{
		closed = isClosedPath(points),
		minPoints = closed ? 3 : 2
	}: PathOptions & { minPoints?: number } = {}
): Point2D[] {
	const next = (closed ? closePath(points) : points).slice();
	const vertexCount = closed && next.length ? next.length - 1 : next.length;
	const vertexIndex = closed && index === vertexCount ? 0 : index;
	if (vertexCount > minPoints && vertexIndex >= 0 && vertexIndex < vertexCount) {
		next.splice(vertexIndex, 1);
		if (closed) {
			if (next.length === 1) next.pop();
			else next[next.length - 1] = next[0];
		}
	}
	return next;
}

export function translatePath(
	points: Point2D[],
	delta: Point2D,
	{ closed = isClosedPath(points) }: PathOptions = {}
): Point2D[] {
	const next = points.map(([x, y]): Point2D => [x + delta[0], y + delta[1]]);
	return closed ? closePath(next) : next;
}

export function getPathMidpoints(
	points: Point2D[],
	{ closed = isClosedPath(points) }: PathOptions = {}
): Array<{ index: number; insertIndex: number; point: Point2D }> {
	const edgeCount = closed && !isClosedPath(points) ? points.length : points.length - 1;
	const midpoints: Array<{ index: number; insertIndex: number; point: Point2D }> = [];
	for (let index = 0; index < edgeCount; index++) {
		const start = points[index];
		const end = points[(index + 1) % points.length];
		midpoints.push({
			index,
			insertIndex: index + 1,
			point: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
		});
	}
	return midpoints;
}
