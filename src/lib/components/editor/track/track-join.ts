import { distance } from '@turf/turf';
import type { Point2D } from '@vorstieg/fels-types/types';

/** Orient both tracks at their closest endpoints without dropping a distinct endpoint. */
export function previewTrackJoin(first: Point2D[], second: Point2D[]) {
	if (first.length < 2 || second.length < 2) return null;
	const orientations = [
		{ left: first, right: second },
		{ left: first, right: [...second].reverse() },
		{ left: second, right: first },
		{ left: [...second].reverse(), right: first }
	].map(({ left, right }) => ({
		left,
		right,
		gapMeters: distance(left[left.length - 1], right[0], { units: 'meters' })
	}));
	const best = orientations.sort((a, b) => a.gapMeters - b.gapMeters)[0];
	const from = best.left[best.left.length - 1],
		to = best.right[0];
	const sameEndpoint = from[0] === to[0] && from[1] === to[1];
	return {
		points: [...best.left, ...best.right.slice(sameEndpoint ? 1 : 0)].map((point): Point2D => [
			...point
		]),
		connection: [[...from], [...to]] as Point2D[],
		gapMeters: best.gapMeters
	};
}
