import { Triangle, Vector3 } from 'three';
import { checkFlightWork, FLIGHT_LIMITS } from './flight-plan-limits.ts';

// No terrain callback runs while these scratch objects are in use. Reusing
// them avoids allocating vectors for each of the many triangle checks.
const triangle = new Triangle();
const aircraft = new Vector3();
const closest = new Vector3();

export function pointToTriangleDistance(
	point: readonly number[],
	first: readonly number[],
	second: readonly number[],
	third: readonly number[]
): number {
	aircraft.fromArray(point);
	triangle.a.fromArray(first);
	triangle.b.fromArray(second);
	triangle.c.fromArray(third);
	triangle.closestPointToPoint(aircraft, closest);
	return aircraft.distanceTo(closest);
}

/** Reuse shared cell vertices through numeric grid indices, avoiding coordinate string keys. */
export function terrainSurfaceClearance(
	local: number[],
	altitude: number,
	terrainAt: (local: number[]) => number,
	minimumDistanceMeters: number,
	meshSpacingMeters: number
): number {
	const radius = minimumDistanceMeters + meshSpacingMeters;
	const count = Math.ceil(radius / meshSpacingMeters);
	const width = count * 2 + 1;
	checkFlightWork(width * width, FLIGHT_LIMITS.meshVertices, 'Clearance mesh vertices');
	const points: (number[] | undefined)[] = new Array(width * width);
	const sample = (column: number, row: number, x: number, y: number): number[] => {
		const index = (row + count) * width + column + count;
		return (points[index] ??= [x, y, terrainAt([x, y])]);
	};
	let minimum = Infinity;
	const aircraft = [local[0], local[1], altitude];
	for (let y = -count; y < count; y += 1) {
		for (let x = -count; x < count; x += 1) {
			const west = local[0] + x * meshSpacingMeters;
			const south = local[1] + y * meshSpacingMeters;
			const east = west + meshSpacingMeters;
			const north = south + meshSpacingMeters;
			const southwest = sample(x, y, west, south);
			const southeast = sample(x + 1, y, east, south);
			const northwest = sample(x, y + 1, west, north);
			const northeast = sample(x + 1, y + 1, east, north);
			minimum = Math.min(
				minimum,
				pointToTriangleDistance(aircraft, southwest, southeast, northeast),
				pointToTriangleDistance(aircraft, southwest, northeast, northwest)
			);
		}
	}
	if (!Number.isFinite(minimum))
		throw new Error('Terrain clearance could not be calculated reliably.');
	return minimum;
}
