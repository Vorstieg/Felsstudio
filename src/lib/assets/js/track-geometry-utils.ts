import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import type { Point2D } from '@vorstieg/fels-types/types';

/** Longitude/latitude pair used by recorded tracks. */
export type TrackCleanupOptions = { radiusMeters?: number; minimumPoints?: number };

export function fitCoordinatesBounds(
	map: maplibregl.Map | null | undefined,
	coordinates: Point2D[] = [],
	options: maplibregl.FitBoundsOptions = {}
): void {
	if (!map || coordinates.length === 0) return;
	const bounds = coordinates.reduce(
		(bounds, coordinate) => bounds.extend(coordinate),
		new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
	);
	map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 500, ...options });
}

export function reverseCoordinates<T>(coordinates: T[] = []): T[] {
	return [...coordinates].reverse();
}

export function trimCoordinatesStart<T>(coordinates: T[] = [], index = 0): T[] {
	return coordinates.slice(Math.max(0, index));
}

export function trimCoordinatesEnd<T>(coordinates: T[] = [], count = 0): T[] {
	return coordinates.slice(0, Math.max(0, coordinates.length - count));
}

export function simplifyTrackCoordinates(coordinates: Point2D[] = [], toleranceMeters = 10): Point2D[] {
	if (!Array.isArray(coordinates) || coordinates.length <= 2) return [...coordinates];
	if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0) return [...coordinates];

	const feature = {
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'LineString',
			coordinates
		}
	} as const;
	const mercator = turf.toMercator(feature);
	const simplifiedMercator = turf.simplify(mercator, {
		tolerance: toleranceMeters,
		highQuality: true,
		mutate: false
	});
	const simplified =
		(turf.toWgs84(simplifiedMercator) as { geometry?: { coordinates?: Point2D[] } } | undefined)
			?.geometry?.coordinates || [];
	return simplified.length >= 2 ? simplified : [...coordinates];
}

/**
 * Collapses dense GPS-drift runs created while a recorder is stationary.
 *
 * A run is considered stationary when all of its points remain within the
 * supplied radius of its first point.  Its first and last point are retained
 * so the surrounding track remains connected.  The deliberately conservative
 * minimum-point threshold avoids treating normal, slow walking as a pause.
 */
export function cleanStationaryTrackCoordinates(
	coordinates: Point2D[] = [],
	{ radiusMeters = 15, minimumPoints = 20 }: TrackCleanupOptions = {}
) {
	if (!Array.isArray(coordinates) || coordinates.length <= 2) return [...coordinates];
	if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return [...coordinates];
	if (!Number.isInteger(minimumPoints) || minimumPoints < 3) return [...coordinates];

	const cleaned = [[...coordinates[0]]];
	let index = 1;

	while (index < coordinates.length) {
		const anchor = coordinates[index - 1];
		let end = index;
		while (
			end < coordinates.length &&
			turf.distance(anchor, coordinates[end], { units: 'meters' }) <= radiusMeters
		) {
			end += 1;
		}

		const runLength = end - (index - 1);
		if (runLength >= minimumPoints) {
			const lastStationaryPoint = coordinates[end - 1];
			const previous = cleaned[cleaned.length - 1];
			if (previous[0] !== lastStationaryPoint[0] || previous[1] !== lastStationaryPoint[1]) {
				cleaned.push([...lastStationaryPoint]);
			}
			index = end;
			continue;
		}

		cleaned.push([...coordinates[index]]);
		index += 1;
	}

	return cleaned;
}
