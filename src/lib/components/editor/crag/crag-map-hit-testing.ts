import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import type { ActiveTrackTarget } from './crag-track-types.ts';
import { trackHitRadius, type ScreenPoint } from '../track/track-interactions.ts';
export { trackHitRadius } from '../track/track-interactions.ts';

export type CragMapProperties = {
	feature?: string;
	kind?: string;
	documentPath?: string;
	pathId?: string | number;
	pathIndex?: string | number;
	accessFeatureId?: string;
	path?: string;
};
export function queryCragFeatures(
	map: MapLibreMap | null | undefined,
	point: ScreenPoint,
	pathsOnly = false,
	radius = trackHitRadius()
): Pick<MapGeoJSONFeature, 'properties'>[] {
	if (!map) return [];
	const layers = [
		'route-paths-line',
		'tracks-line-saved',
		...(pathsOnly ? [] : ['sector-polygons-fill', 'sector-polygons-outline'])
	].filter((layer) => map.getLayer(layer));
	return layers.length
		? map.queryRenderedFeatures(
				[
					[point.x - radius, point.y - radius],
					[point.x + radius, point.y + radius]
				],
				{ layers }
			)
		: [];
}
export function trackTargetFromProperties(properties: CragMapProperties): ActiveTrackTarget | null {
	if (properties.kind === 'approach' && properties.accessFeatureId)
		return { kind: 'access', featureId: String(properties.accessFeatureId) };
	if (properties.feature !== 'route-path' || !properties.documentPath || properties.pathId == null)
		return null;
	const index = properties.pathIndex == null ? NaN : Number(properties.pathIndex);
	return {
		kind: 'route-path',
		documentPath: properties.documentPath,
		pathId: String(properties.pathId),
		...(Number.isInteger(index) ? { pathIndex: index } : {})
	};
}
export function canJoinTrackTargets(
	base: ActiveTrackTarget,
	candidate: ActiveTrackTarget
): boolean {
	return base.kind === 'access' && candidate.kind === 'access'
		? base.featureId !== candidate.featureId
		: base.kind === 'route-path' &&
				candidate.kind === 'route-path' &&
				base.documentPath === candidate.documentPath &&
				base.pathId !== candidate.pathId;
}
