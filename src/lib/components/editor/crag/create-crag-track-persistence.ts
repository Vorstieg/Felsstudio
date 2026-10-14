import { cloneTrackCoordinates as clone } from '../track/track-coordinates.ts';
import { createAccessId } from '$lib/assets/js/access-geojson.ts';
import type { Point2D } from '@vorstieg/fels-types/types';
import type { CragEditorSession } from '$lib/types/crag.ts';
import type { AccessTrackFeature, ActiveTrackTarget, RoutePathTarget } from './crag-track-types.ts';

export type SaveTrack = { target: ActiveTrackTarget | null; segments: Point2D[][]; name: string };
export type JoinTracks = {
	base: ActiveTrackTarget;
	candidate: ActiveTrackTarget;
	points: Point2D[];
	name: string;
};
export interface CragTrackPersistence {
	get(target: ActiveTrackTarget | null): AccessTrackFeature | null;
	save(command: SaveTrack): boolean;
	join(command: JoinTracks): boolean;
	remove(target: ActiveTrackTarget): boolean;
}
type RoutePathPersistence = {
	save(target: RoutePathTarget, segments: Point2D[][]): boolean;
	join(base: RoutePathTarget, candidate: RoutePathTarget, points: Point2D[], name: string): boolean;
	remove(target: RoutePathTarget): boolean;
};

/** Each save or join replaces its document in one workspace history entry. */
export function createCragTrackPersistence(
	state: CragEditorSession,
	routePaths?: RoutePathPersistence
): CragTrackPersistence {
	const features = () => (state.getWorkspaceAccess()?.features || []) as AccessTrackFeature[];
	function get(target: ActiveTrackTarget | null): AccessTrackFeature | null {
		if (!target) return null;
		if (target.kind === 'access')
			return features().find((feature) => feature.id === target.featureId) || null;
		const nodePath = target.documentPath.replace(/\/[^/]+$/, '');
		const feature = state
			.getWorkspaceTopo(nodePath)
			?.paths?.features.find((feature) => String(feature.id) === target.pathId);
		return feature?.geometry?.type === 'LineString'
			? {
					type: 'Feature',
					id: String(feature.id),
					properties: { ...feature.properties },
					geometry: {
						type: feature.geometry.type,
						// Map editing uses longitude/latitude, but joining retains stored altitude.
						coordinates: feature.geometry.coordinates.map((point) => Array.from(point) as Point2D)
					}
				}
			: null;
	}
	return {
		get,
		save({ target, segments, name }) {
			if (!segments.length || segments.some((points) => points.length < 2)) return false;
			if (target?.kind === 'route-path') return routePaths?.save(target, segments) ?? false;
			const existing = get(target);
			if (target && !existing) return false;
			const first: AccessTrackFeature = {
				...(existing || {}),
				type: 'Feature',
				id: existing?.id || createAccessId('approach'),
				geometry: { type: 'LineString', coordinates: clone(segments[0]) },
				properties: {
					...existing?.properties,
					kind: 'approach',
					name:
						existing?.properties?.name ||
						name ||
						`Approach ${features().filter((feature) => feature.properties?.kind === 'approach').length + 1}`
				}
			};
			const additions = segments.slice(1).map((coordinates, index): AccessTrackFeature => ({
				...first,
				id: createAccessId('approach'),
				geometry: { type: 'LineString', coordinates: clone(coordinates) },
				properties: { ...first.properties, name: `${first.properties?.name} · ${index + 2}` }
			}));
			state.replaceAccessFeatures([
				...features().filter((feature) => feature.id !== existing?.id),
				first,
				...additions
			]);
			return true;
		},
		join({ base, candidate, points, name }) {
			if (points.length < 2) return false;
			const first = get(base),
				second = get(candidate);
			if (!first || !second) return false;
			if (
				base.kind === 'route-path' &&
				candidate.kind === 'route-path' &&
				base.documentPath === candidate.documentPath &&
				base.pathId !== candidate.pathId
			)
				return routePaths?.join(base, candidate, points, name) ?? false;
			if (
				base.kind !== 'access' ||
				candidate.kind !== 'access' ||
				base.featureId === candidate.featureId
			)
				return false;
			state.replaceAccessFeatures(
				features()
					.filter((feature) => feature.id !== candidate.featureId)
					.map((feature) =>
						feature.id === base.featureId
							? {
									...feature,
									geometry: { type: 'LineString', coordinates: clone(points) },
									properties: {
										...second.properties,
										...feature.properties,
										kind: 'approach',
										name
									}
								}
							: feature
					)
			);
			return true;
		},
		remove(target) {
			if (!get(target)) return false;
			if (target.kind === 'route-path') return routePaths?.remove(target) ?? false;
			state.replaceAccessFeatures(features().filter((feature) => feature.id !== target.featureId));
			return true;
		}
	};
}
