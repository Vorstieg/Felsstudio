import { distance, lineString, nearestPointOnLine, point } from '@turf/turf';
import type { Geometry } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { ScreenPoint } from './track-interactions.ts';

export const TRACK_SNAP_LAYER_ID = 'snap-helper';
const DEFAULT_WAY_LAYERS = [
	'Path',
	'Track',
	'Minor road',
	'Minor road outline',
	'Main road',
	'Highway',
	'Road construction',
	TRACK_SNAP_LAYER_ID
];
type WayFeature = { geometry: Geometry | null };
type SnapMap = Pick<MapLibreMap, 'getLayer' | 'queryRenderedFeatures'>;
type SnapOptions = { layerIds?: readonly string[]; radiusPx?: number };

/** Finds the closest point on road/path geometry without changing the input features. */
export function nearestWayPoint(original: Point2D, features: readonly WayFeature[]): Point2D {
	const destination = point(original);
	let closest: Point2D = original;
	let minimumDistance = Infinity;
	for (const { geometry } of features) {
		const lines =
			geometry?.type === 'LineString'
				? [geometry.coordinates]
				: geometry?.type === 'MultiLineString'
					? geometry.coordinates
					: [];
		for (const coordinates of lines) {
			if (
				coordinates.length < 2 ||
				coordinates.some(
					(coordinate) =>
						coordinate.length < 2 ||
						!Number.isFinite(coordinate[0]) ||
						!Number.isFinite(coordinate[1])
				)
			)
				continue;
			const snapped = nearestPointOnLine(lineString(coordinates), destination);
			const candidateDistance = distance(destination, snapped);
			if (candidateDistance < minimumDistance) {
				minimumDistance = candidateDistance;
				closest = [snapped.geometry.coordinates[0], snapped.geometry.coordinates[1]];
			}
		}
	}
	return closest;
}

/** Queries only supported way layers near the click, then applies the geometry calculation. */
export function snapToNearestWay(
	map: SnapMap | null | undefined,
	screenPoint: ScreenPoint,
	original: Point2D,
	{ layerIds = DEFAULT_WAY_LAYERS, radiusPx = 20 }: SnapOptions = {}
): Point2D {
	if (!map) return original;
	const layers = layerIds.filter((id) => map.getLayer(id));
	if (!layers.length) return original;
	const features = map.queryRenderedFeatures(
		[
			[screenPoint.x - radiusPx, screenPoint.y - radiusPx],
			[screenPoint.x + radiusPx, screenPoint.y + radiusPx]
		],
		{ layers }
	);
	return nearestWayPoint(original, features);
}
