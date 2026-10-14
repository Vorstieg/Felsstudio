import type { Point2D } from '@vorstieg/fels-types/types';
export type ScreenPoint = { x: number; y: number };
export type Projector = {
	project: (point: Point2D) => ScreenPoint;
	unproject: (point: [number, number]) => { lng: number; lat: number };
};

export function nearestTrackPoint(
	points: Point2D[],
	at: ScreenPoint,
	map: Pick<Projector, 'project'>,
	radius: number
): number | null {
	let closest: number | null = null;
	let distance = radius;
	points.forEach((point, index) => {
		const screen = map.project(point);
		const next = Math.hypot(screen.x - at.x, screen.y - at.y);
		if (next <= radius && (closest === null || next < distance)) {
			closest = index;
			distance = next;
		}
	});
	return closest;
}

export function nearestTrackSplit(points: Point2D[], at: ScreenPoint, map: Projector, radius = 24) {
	let best: { coordinate: Point2D; index: number; distance: number } | null = null;
	for (let index = 0; index < points.length - 1; index++) {
		const a = map.project(points[index]),
			b = map.project(points[index + 1]);
		const dx = b.x - a.x,
			dy = b.y - a.y;
		const t = Math.max(
			0,
			Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1))
		);
		const x = a.x + t * dx,
			y = a.y + t * dy;
		const distance = Math.hypot(at.x - x, at.y - y);
		if (distance > radius || (best && distance >= best.distance)) continue;
		if ((index === 0 && t === 0) || (index === points.length - 2 && t === 1)) continue;
		const coordinate = map.unproject([x, y]);
		best = { index, distance, coordinate: [coordinate.lng, coordinate.lat] };
	}
	if (!best) return null;
	const first = points.slice(0, best.index + 1),
		second = points.slice(best.index + 1);
	const same = (a: Point2D, b: Point2D) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-12;
	if (!same(first[first.length - 1], best.coordinate)) first.push(best.coordinate);
	if (!same(second[0], best.coordinate)) second.unshift(best.coordinate);
	return first.length >= 2 && second.length >= 2
		? { first, second, coordinate: best.coordinate }
		: null;
}

export function trackHitRadius(pointerType?: string): number {
	if (pointerType) return pointerType === 'touch' ? 22 : 12;
	return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
		? 22
		: 12;
}
