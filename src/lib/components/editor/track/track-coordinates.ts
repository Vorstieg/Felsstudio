import type { Point2D } from '@vorstieg/fels-types/types';

export const cloneTrackCoordinates = (points: Point2D[]): Point2D[] =>
	points.map((point) => [...point]);

export const sameTrackCoordinates = (first: Point2D[], second: Point2D[]): boolean =>
	first.length === second.length &&
	first.every(
		(point, index) =>
			point.length === second[index].length &&
			point.every((value, axis) => value === second[index][axis])
	);

/** Stale-preview checks compare map geometry without treating altitude as a moved endpoint. */
export const sameMapCoordinates = (first: Point2D[], second: Point2D[]): boolean =>
	first.length === second.length &&
	first.every((point, index) => point[0] === second[index][0] && point[1] === second[index][1]);
