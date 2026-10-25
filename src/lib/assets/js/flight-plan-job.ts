import type { Polygon } from 'geojson';
import {
	generateFlightPlan,
	flightPlanTerrainBounds,
	type FlightPlanOptions
} from './flight-plan-generator.ts';
import { createSnapshotClearance } from './flight-plan-mesh.ts';
import {
	WORLD_METERS,
	TILE_SIZE,
	loadTerrainSnapshot,
	snapshotElevationAt,
	TERRAIN_SOURCE,
	type TerrainSnapshot
} from './flight-plan-snapshot.ts';

export type FlightPlanRequestOptions = Omit<
	FlightPlanOptions,
	'terrainElevationAt' | 'terrainClearanceAt'
>;

/** Generate against the same native terrain snapshot used for clearance checks. */
export function generateFlightPlanFromSnapshot(
	geometry: Polygon,
	options: FlightPlanRequestOptions,
	snapshot: TerrainSnapshot
) {
	snapshot = { ...snapshot, origin: flightPlanTerrainBounds(geometry, options).origin };
	const mesh = createSnapshotClearance(
		snapshot,
		(options.minimumFaceDistanceMeters ?? 2) + (options.clearanceMarginMeters ?? 1),
		options.terrainMeshSpacingMeters ?? 1
	);
	try {
		const plan = generateFlightPlan(geometry, {
			...options,
			terrainElevationAt: (longitude, latitude) =>
				snapshotElevationAt(snapshot, longitude, latitude),
			terrainClearanceAt: mesh.clearance
		});
		plan.metadata.terrainSource = TERRAIN_SOURCE;
		plan.metadata.terrainZoom = snapshot.zoom;
		plan.metadata.terrainPixelSpacingMeters =
			(WORLD_METERS * Math.cos((snapshot.origin[1] * Math.PI) / 180)) /
			(TILE_SIZE * 2 ** snapshot.zoom);
		plan.metadata.terrainSnapshotVertices = mesh.stats.vertices;
		plan.metadata.terrainBvhAccepted = mesh.stats.bvhAccepted;
		plan.metadata.terrainFallbackSamples = mesh.stats.fallbackSamples;
		plan.metadata.terrainClearanceMethod = 'source-aligned-bvh-with-local-fallback';
		return plan;
	} finally {
		mesh.dispose();
	}
}

export async function runFlightPlanJob(
	geometry: Polygon,
	options: FlightPlanRequestOptions,
	progress: (message: string) => void
) {
	progress('Loading terrain…');
	const snapshot = await loadTerrainSnapshot(geometry, options, progress);
	progress('Calculating flight path…');
	return generateFlightPlanFromSnapshot(geometry, options, snapshot);
}
