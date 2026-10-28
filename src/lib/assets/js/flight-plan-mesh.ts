import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { CENTER, MeshBVH } from 'three-mesh-bvh';
import { checkFlightWork, FLIGHT_LIMITS } from './flight-plan-limits.ts';
import { terrainSurfaceClearance } from './flight-plan-terrain.ts';
import {
	geographicCoordinate,
	localCoordinate,
	pixelCoordinate,
	snapshotElevationAt,
	validateTerrainSnapshot,
	type TerrainSnapshot
} from './flight-plan-snapshot.ts';

/** Source-pixel aligned BVH with a conservative shortcut for the existing sampler. */
export function createSnapshotClearance(
	snapshot: TerrainSnapshot,
	minimumDistance: number,
	spacing: number
) {
	validateTerrainSnapshot(snapshot);
	const { width, height, elevations: z } = snapshot;
	const xs = new Float64Array(width),
		ys = new Float64Array(height);
	for (let column = 0; column < width; column++) {
		const coordinate = pixelCoordinate(
			snapshot.firstPixelX + column,
			snapshot.firstPixelY,
			snapshot.zoom
		);
		xs[column] = localCoordinate(snapshot, ...(coordinate as [number, number]))[0];
	}
	for (let row = 0; row < height; row++) {
		const coordinate = pixelCoordinate(
			snapshot.firstPixelX,
			snapshot.firstPixelY + row,
			snapshot.zoom
		);
		ys[row] = localCoordinate(snapshot, ...(coordinate as [number, number]))[1];
	}
	const positions = new Float64Array(width * height * 3);
	for (let row = 0; row < height; row++)
		for (let column = 0; column < width; column++) {
			const index = row * width + column;
			positions[index * 3] = xs[column];
			positions[index * 3 + 1] = ys[row];
			positions[index * 3 + 2] = z[index];
		}
	const indices = new Uint32Array((width - 1) * (height - 1) * 6);
	const interpolationErrors = new Float64Array((width - 1) * (height - 1));
	let maxSlope = 0,
		maxInterpolationError = 0;
	for (let row = 0; row < height - 1; row++)
		for (let column = 0; column < width - 1; column++) {
			const nw = row * width + column,
				ne = nw + 1,
				sw = nw + width,
				se = sw + 1;
			indices.set([sw, se, ne, sw, ne, nw], (row * (width - 1) + column) * 6);
			const north =
				(pixelCoordinate(snapshot.firstPixelX, snapshot.firstPixelY + row, snapshot.zoom)[1] *
					Math.PI) /
				180;
			const south =
				(pixelCoordinate(snapshot.firstPixelX, snapshot.firstPixelY + row + 1, snapshot.zoom)[1] *
					Math.PI) /
				180;
			const cosines = [Math.cos(north), Math.cos(south)];
			const warp = (north * south <= 0 ? 1 : Math.max(...cosines)) / Math.min(...cosines) - 1;
			const yChange = Math.max(Math.abs(z[nw] - z[sw]), Math.abs(z[ne] - z[se]));
			const slopeX =
				Math.max(Math.abs(z[ne] - z[nw]), Math.abs(z[se] - z[sw])) / (xs[column + 1] - xs[column]);
			const slopeY = (yChange * (1 + warp)) / (ys[row] - ys[row + 1]);
			maxSlope = Math.max(maxSlope, Math.hypot(slopeX, slopeY));
			// Bilinear-versus-triangle error plus the Mercator/local-latitude warp.
			const interpolationError = Math.abs(z[nw] - z[ne] - z[sw] + z[se]) / 4 + yChange * warp;
			interpolationErrors[row * (width - 1) + column] = interpolationError;
			maxInterpolationError = Math.max(maxInterpolationError, interpolationError);
		}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new BufferAttribute(positions, 3));
	geometry.setIndex(new BufferAttribute(indices, 1));
	const bvh = new MeshBVH(geometry, { strategy: CENTER, targetLeafSize: 8, indirect: true });
	const point = new Vector3(),
		target = { point: new Vector3(), distance: 0, faceIndex: 0 };
	const closest = new Vector3();
	const stencil = Math.ceil((minimumDistance + spacing) / spacing) * spacing;
	// Every moving-grid triangle lies within maxSlope * diagonal(spacing) of
	// the bilinear DEM; the aligned triangles differ by maxInterpolationError.
	// Their sum is a conservative Hausdorff bound, including a numeric margin.
	const errorBound = maxInterpolationError + maxSlope * Math.SQRT2 * spacing + 1e-5;
	const stats = { bvhAccepted: 0, fallbackSamples: 0, vertices: width * height, errorBound };
	let terrainQueries = 0;
	const terrainAt = (local: number[]) => {
		checkFlightWork(
			++terrainQueries,
			FLIGHT_LIMITS.terrainQueries,
			'Clearance terrain evaluations'
		);
		const [longitude, latitude] = geographicCoordinate(snapshot, local);
		return snapshotElevationAt(snapshot, longitude, latitude);
	};
	const cache = new Map<string, number>();
	const calculateClearance = (local: number[], altitude: number): number => {
		const covered =
			local[0] - stencil >= xs[0] &&
			local[0] + stencil <= xs[width - 1] &&
			local[1] - stencil >= ys[height - 1] &&
			local[1] + stencil <= ys[0];
		let sourceLowerBound = Infinity;
		if (covered) {
			point.set(local[0], local[1], altitude);
			const distance =
				bvh.closestPointToPoint(point, target, 0, minimumDistance + errorBound)?.distance ??
				Infinity;
			sourceLowerBound = Math.max(0, distance - maxInterpolationError - 1e-5);
			if (sourceLowerBound < minimumDistance) {
				// Distant rough cells must not penalize an otherwise clear local surface.
				// Bound each patch separately; all skipped patches are farther than
				// the required clearance even after their maximum possible error.
				sourceLowerBound = minimumDistance;
				bvh.shapecast({
					intersectsBounds: (box) =>
						box.distanceToPoint(point) <= minimumDistance + maxInterpolationError + 1e-5,
					intersectsTriangle: (triangle, index) => {
						triangle.closestPointToPoint(point, closest);
						sourceLowerBound = Math.min(
							sourceLowerBound,
							Math.max(
								0,
								point.distanceTo(closest) - interpolationErrors[Math.floor(index / 2)] - 1e-5
							)
						);
						return sourceLowerBound === 0;
					}
				});
			}
			if (distance >= minimumDistance + errorBound) {
				stats.bvhAccepted++;
				return minimumDistance;
			}
		}
		stats.fallbackSamples++;
		// Retain both the legacy stencil rejection and the conservative native
		// raster bound. Neither sampling model may turn an unsafe sample safe.
		return Math.min(
			sourceLowerBound,
			terrainSurfaceClearance(local, altitude, terrainAt, minimumDistance, spacing)
		);
	};
	return {
		stats,
		clearance(local: number[], altitude: number): number {
			const key = `${local[0]}:${local[1]}:${altitude}`;
			const cached = cache.get(key);
			if (cached !== undefined) return cached;
			const clearance = calculateClearance(local, altitude);
			if (cache.size >= 65536) cache.clear();
			cache.set(key, clearance);
			return clearance;
		},
		dispose() {
			cache.clear();
			geometry.dispose();
		}
	};
}
