/**
 * Deterministic, terrain-relative capture plans for a sector footprint.
 *
 * A sector polygon supplies the face extent and the MapTerhorn DEM supplies the estimated 3D
 * surface. Capture height is the elevation difference between the sector vertices. We use the
 * longest axis for the capture curtain and reject waypoints that are too close to that sampled
 * terrain surface. Altitude in the result is AMSL.
 */

import type { FlightPlan, FlightWaypoint } from './flight-plan-types.ts';
import type { Polygon } from 'geojson';
import { terrainSurfaceClearance } from './flight-plan-terrain.ts';
import { FLIGHT_LIMITS, checkFlightWork } from './flight-plan-limits.ts';

type LocalWaypoint = Omit<FlightWaypoint, 'longitude' | 'latitude'> & { local: LocalPoint };
type DraftWaypoint = Omit<LocalWaypoint, 'index' | 'rowBoundary'> & { sampleIndex: number };
type WallCandidate = { along: number; across: number; topAcross: number; slope: number };
type LocalPoint = number[];
type TerrainAt = (point: LocalPoint) => number;

const EARTH_RADIUS_METERS = 6378137;
const DEFAULTS = {
	pattern: 'facade-grid',
	targetGsdCm: 0.5,
	standOffMeters: 2,
	stripSpacingMeters: 10,
	pointSpacingMeters: 5,
	speed: 2.5,
	transitSpeed: 5,
	camera: 'tele-6x',
	minimumFaceDistanceMeters: 2,
	minimumGroundClearanceMeters: 3,
	captureAltitudeToleranceMeters: 5,
	terrainMeshSpacingMeters: 1,
	wallDetectionSpacingMeters: 1,
	wallDetectionCrossSectionSpacingMeters: 0.5,
	minimumWallSlope: 0.5,
	wallSurfaceSampleSpacingMeters: 0.5,
	convergentPasses: 2,
	convergentOffsetMeters: 2,
	terrainElevationAt: (_longitude: number, _latitude: number) => 0
};

export type FlightPlanOptions = Partial<Omit<typeof DEFAULTS, 'terrainElevationAt'>> & {
	name?: string;
	cragName?: string;
	/** Launch elevation in metres AMSL, using the same datum as the terrain. */
	startElevation?: number;
	terrainElevationAt?: (longitude: number, latitude: number) => number;
	/** Internal worker hook, in the generator centroid's local metre frame. */
	terrainClearanceAt?: (local: number[], altitude: number) => number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const clamp = (number: number, lower: number, upper: number) =>
	Math.max(lower, Math.min(upper, number));

function openRing(geometry: Polygon | null | undefined): number[][] {
	if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0])) {
		throw new TypeError('A GeoJSON Polygon with a non-empty outer ring is required.');
	}
	checkFlightWork(
		geometry.coordinates[0].length,
		FLIGHT_LIMITS.polygonVertices,
		'Polygon vertices'
	);
	const ring = geometry.coordinates[0].filter(
		(point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
	);
	if (ring.length < 3) throw new TypeError('The sector polygon needs at least three coordinates.');
	const first = ring[0];
	const last = ring[ring.length - 1];
	return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

function createProjection(ring: LocalPoint[]) {
	const origin = ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
	origin[0] /= ring.length;
	origin[1] /= ring.length;
	const latitudeScale = toRadians(1) * EARTH_RADIUS_METERS;
	const longitudeScale = latitudeScale * Math.cos(toRadians(origin[1]));
	return {
		origin,
		toLocal: ([longitude, latitude]: number[]) => [
			(longitude - origin[0]) * longitudeScale,
			(latitude - origin[1]) * latitudeScale
		],
		toLngLat: ([x, y]: number[]) => [origin[0] + x / longitudeScale, origin[1] + y / latitudeScale]
	};
}

function principalAxis(points: LocalPoint[]): LocalPoint {
	const mean = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
	mean[0] /= points.length;
	mean[1] /= points.length;
	let xx = 0;
	let xy = 0;
	let yy = 0;
	for (const [x, y] of points) {
		const dx = x - mean[0];
		const dy = y - mean[1];
		xx += dx * dx;
		xy += dx * dy;
		yy += dy * dy;
	}
	const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
	return [Math.cos(angle), Math.sin(angle)];
}

function headingTo(target: LocalPoint, from: LocalPoint): number {
	// Local x is east, y is north.  DJI heading is clockwise from north.
	return (toDegrees(Math.atan2(target[0] - from[0], target[1] - from[1])) + 360) % 360;
}

function normalFacingUphill(
	normal: LocalPoint,
	center: LocalPoint,
	standOffMeters: number,
	terrainAt: TerrainAt
): LocalPoint {
	// A footprint has no winding convention that identifies the air-facing side
	// of a wall.  On a cliff, the usable air side is normally lower than the
	// sector centre; choosing it makes the aircraft look uphill, towards the
	// cliff, rather than out across the plateau behind it.
	const sampleDistance = Math.max(standOffMeters, 10);
	const positive = [center[0] + normal[0] * sampleDistance, center[1] + normal[1] * sampleDistance];
	const negative = [center[0] - normal[0] * sampleDistance, center[1] - normal[1] * sampleDistance];
	const centerElevation = terrainAt(center);
	const positiveRiseToCliff = centerElevation - terrainAt(positive);
	const negativeRiseToCliff = centerElevation - terrainAt(negative);

	// Preserve a stable result on level or unresolved terrain: the PCA normal
	// remains the tie-breaker, so generation is deterministic.
	return positiveRiseToCliff >= negativeRiseToCliff ? normal : [-normal[0], -normal[1]];
}

function sectorElevationRange(localRing: LocalPoint[], terrainAt: TerrainAt) {
	// Sector vertices are the defined top and bottom bounds of the face. Heights
	// are all AMSL and their difference is the height the capture curtain covers.
	const elevations = localRing.map(terrainAt);
	return {
		minimum: Math.min(...elevations),
		maximum: Math.max(...elevations),
		height: Math.max(...elevations) - Math.min(...elevations)
	};
}

function crossSectionRange(
	localRing: LocalPoint[],
	axis: LocalPoint,
	normal: LocalPoint,
	along: number
): [number, number] | null {
	const intersections: number[] = [];
	for (let index = 0; index < localRing.length; index += 1) {
		const first = localRing[index];
		const second = localRing[(index + 1) % localRing.length];
		const firstAlong = first[0] * axis[0] + first[1] * axis[1];
		const secondAlong = second[0] * axis[0] + second[1] * axis[1];
		if (firstAlong === secondAlong) continue;
		const minimum = Math.min(firstAlong, secondAlong);
		const maximum = Math.max(firstAlong, secondAlong);
		if (along < minimum || along >= maximum) continue;
		const ratio = (along - firstAlong) / (secondAlong - firstAlong);
		const point = [
			first[0] + (second[0] - first[0]) * ratio,
			first[1] + (second[1] - first[1]) * ratio
		];
		intersections.push(point[0] * normal[0] + point[1] * normal[1]);
	}
	if (intersections.length < 2) return null;
	intersections.sort((left, right) => left - right);
	return [intersections[0], intersections[intersections.length - 1]];
}

function smoothWallPoints(points: WallCandidate[]): WallCandidate[] {
	return points.map((point, index) => {
		const nearby = points.slice(Math.max(0, index - 2), Math.min(points.length, index + 3));
		return {
			...point,
			across: nearby.reduce((sum, item) => sum + item.across, 0) / nearby.length,
			topAcross: nearby.reduce((sum, item) => sum + item.topAcross, 0) / nearby.length
		};
	});
}

function solveThreeByThree(matrix: number[][], values: number[]): number[] | null {
	const augmented = matrix.map((row, index) => [...row, values[index]]);
	for (let pivot = 0; pivot < 3; pivot += 1) {
		let pivotRow = pivot;
		for (let row = pivot + 1; row < 3; row += 1) {
			if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[pivotRow][pivot])) pivotRow = row;
		}
		if (Math.abs(augmented[pivotRow][pivot]) < 1e-9) return null;
		[augmented[pivot], augmented[pivotRow]] = [augmented[pivotRow], augmented[pivot]];
		const divisor = augmented[pivot][pivot];
		for (let column = pivot; column < 4; column += 1) augmented[pivot][column] /= divisor;
		for (let row = 0; row < 3; row += 1) {
			if (row === pivot) continue;
			const factor = augmented[row][pivot];
			for (let column = pivot; column < 4; column += 1) {
				augmented[row][column] -= factor * augmented[pivot][column];
			}
		}
	}
	return augmented.map((row) => row[3]);
}

function classifyWallCurvature(points: Array<{ along: number; across: number }>) {
	if (points.length < 3) return { shape: 'unknown', deviationMeters: 0 };
	const centerAlong = points.reduce((sum, point) => sum + point.along, 0) / points.length;
	const sums = points.reduce(
		(sum, point) => {
			const x = point.along - centerAlong;
			const y = point.across;
			return {
				one: sum.one + 1,
				x: sum.x + x,
				x2: sum.x2 + x * x,
				x3: sum.x3 + x * x * x,
				x4: sum.x4 + x * x * x * x,
				y: sum.y + y,
				xy: sum.xy + x * y,
				x2y: sum.x2y + x * x * y
			};
		},
		{ one: 0, x: 0, x2: 0, x3: 0, x4: 0, y: 0, xy: 0, x2y: 0 }
	);
	const coefficients = solveThreeByThree(
		[
			[sums.x4, sums.x3, sums.x2],
			[sums.x3, sums.x2, sums.x],
			[sums.x2, sums.x, sums.one]
		],
		[sums.x2y, sums.xy, sums.y]
	);
	if (!coefficients) return { shape: 'unknown', deviationMeters: 0 };
	const [quadratic] = coefficients;
	const halfSpan = (points[points.length - 1].along - points[0].along) / 2;
	const deviationMeters = Math.abs(quadratic * halfSpan * halfSpan);
	if (deviationMeters < 1) return { shape: 'flat', deviationMeters };
	// Positive offset points toward the air-facing side. A positive quadratic
	// therefore puts the wall's middle behind its ends (concave); a negative one
	// pushes the middle outward (convex).
	return { shape: quadratic > 0 ? 'concave' : 'convex', deviationMeters };
}

function detectWall(
	localRing: LocalPoint[],
	axis: LocalPoint,
	normal: LocalPoint,
	minAlong: number,
	maxAlong: number,
	options: typeof DEFAULTS,
	terrainAt: TerrainAt
) {
	const alongStep = options.wallDetectionSpacingMeters;
	const crossSectionStep = options.wallDetectionCrossSectionSpacingMeters;
	const candidates: WallCandidate[] = [];
	const steps = Math.max(1, Math.ceil((maxAlong - minAlong) / alongStep));
	checkFlightWork(steps, FLIGHT_LIMITS.wallSamples, 'Wall sections');

	for (let index = 0; index <= steps; index += 1) {
		const along = minAlong + ((maxAlong - minAlong) * index) / steps;
		const range = crossSectionRange(localRing, axis, normal, along);
		if (!range) continue;
		const [minimumAcross, maximumAcross] = range;
		const samples = Math.max(1, Math.ceil((maximumAcross - minimumAcross) / crossSectionStep));
		checkFlightWork(samples, FLIGHT_LIMITS.wallSamples, 'Wall section samples');
		const slopeSamples: Array<{
			firstAcross: number;
			secondAcross: number;
			elevationChange: number;
			slope: number;
		}> = [];
		for (let sample = 0; sample < samples; sample += 1) {
			const firstAcross = minimumAcross + ((maximumAcross - minimumAcross) * sample) / samples;
			const secondAcross =
				minimumAcross + ((maximumAcross - minimumAcross) * (sample + 1)) / samples;
			const first = [
				axis[0] * along + normal[0] * firstAcross,
				axis[1] * along + normal[1] * firstAcross
			];
			const second = [
				axis[0] * along + normal[0] * secondAcross,
				axis[1] * along + normal[1] * secondAcross
			];
			const elevationChange = terrainAt(second) - terrainAt(first);
			slopeSamples.push({
				firstAcross,
				secondAcross,
				elevationChange,
				slope: Math.abs(elevationChange / (secondAcross - firstAcross))
			});
		}
		const steepestIndex = slopeSamples.reduce(
			(best, sample, sampleIndex) => (sample.slope > slopeSamples[best].slope ? sampleIndex : best),
			0
		);
		const steepest = slopeSamples[steepestIndex];
		if (steepest.slope < options.minimumWallSlope) continue;

		// Starting at the face's steepest part, walk downhill until the terrain
		// becomes shallow again. That last steep sample is the toe/base of the wall,
		// rather than the middle of its steepest DEM ramp.
		const downhillDirection = steepest.elevationChange <= 0 ? 1 : -1;
		let baseIndex = steepestIndex;
		while (
			baseIndex + downhillDirection >= 0 &&
			baseIndex + downhillDirection < slopeSamples.length &&
			slopeSamples[baseIndex + downhillDirection].slope >= options.minimumWallSlope
		) {
			baseIndex += downhillDirection;
		}
		const baseSample = slopeSamples[baseIndex];
		let topIndex = steepestIndex;
		while (
			topIndex - downhillDirection >= 0 &&
			topIndex - downhillDirection < slopeSamples.length &&
			slopeSamples[topIndex - downhillDirection].slope >= options.minimumWallSlope
		) {
			topIndex -= downhillDirection;
		}
		const topSample = slopeSamples[topIndex];
		candidates.push({
			along,
			across: downhillDirection > 0 ? baseSample.secondAcross : baseSample.firstAcross,
			topAcross: downhillDirection > 0 ? topSample.firstAcross : topSample.secondAcross,
			slope: steepest.slope
		});
	}

	const coverage = candidates.length / (steps + 1);
	if (candidates.length < 2 || coverage < 0.5) {
		return {
			localPoints: [],
			samplePoints: [],
			confidence: coverage,
			averageSlope: 0,
			shape: 'unknown',
			deviationMeters: 0
		};
	}
	const localPoints = smoothWallPoints(candidates).map(({ along, across, topAcross }) => ({
		along,
		across,
		topAcross,
		local: [axis[0] * along + normal[0] * across, axis[1] * along + normal[1] * across],
		topLocal: [axis[0] * along + normal[0] * topAcross, axis[1] * along + normal[1] * topAcross]
	}));
	return {
		localPoints,
		samplePoints: candidates.map(({ along, across, topAcross, slope }) => ({
			slope,
			local: [axis[0] * along + normal[0] * across, axis[1] * along + normal[1] * across],
			topLocal: [axis[0] * along + normal[0] * topAcross, axis[1] * along + normal[1] * topAcross]
		})),
		confidence: coverage,
		averageSlope: candidates.reduce((sum, point) => sum + point.slope, 0) / candidates.length,
		...classifyWallCurvature(localPoints)
	};
}

function wallFrameAt(
	along: number,
	axis: LocalPoint,
	normal: LocalPoint,
	detectedWall: ReturnType<typeof detectWall>
) {
	const points = detectedWall.localPoints;
	if (points.length < 2) {
		const target = [axis[0] * along, axis[1] * along];
		return { target, topTarget: target, axis, normal };
	}
	const foundUpperIndex = points.findIndex((point) => point.along >= along);
	const upperIndex = foundUpperIndex === -1 ? points.length - 1 : Math.max(1, foundUpperIndex);
	const upper = points[upperIndex];
	const lower = points[upperIndex - 1];
	const ratio = clamp((along - lower.along) / (upper.along - lower.along), 0, 1);
	const target = [
		lower.local[0] + (upper.local[0] - lower.local[0]) * ratio,
		lower.local[1] + (upper.local[1] - lower.local[1]) * ratio
	];
	const topTarget = [
		lower.topLocal[0] + (upper.topLocal[0] - lower.topLocal[0]) * ratio,
		lower.topLocal[1] + (upper.topLocal[1] - lower.topLocal[1]) * ratio
	];
	const tangentLength = Math.hypot(
		upper.local[0] - lower.local[0],
		upper.local[1] - lower.local[1]
	);
	if (tangentLength === 0) return { target, topTarget, axis, normal };
	const localAxis = [
		(upper.local[0] - lower.local[0]) / tangentLength,
		(upper.local[1] - lower.local[1]) / tangentLength
	];
	let localNormal = [-localAxis[1], localAxis[0]];
	if (localNormal[0] * normal[0] + localNormal[1] * normal[1] < 0) {
		localNormal = [-localNormal[0], -localNormal[1]];
	}
	return { target, topTarget, axis: localAxis, normal: localNormal };
}

function createWallSurfaceSampler(terrainAt: TerrainAt, options: typeof DEFAULTS) {
	type SurfaceSample = { local: LocalPoint; elevation: number };
	type Profile = { samples: SurfaceSample[]; maxima: number[]; count: number };
	const profiles = new Map<string, Profile>();
	return (base: LocalPoint, top: LocalPoint, height: number): SurfaceSample | null => {
		const key = `${base[0]}:${base[1]}:${top[0]}:${top[1]}`;
		let profile = profiles.get(key);
		if (!profile) {
			const elevation = terrainAt(base);
			profile = {
				samples: [{ local: base, elevation }],
				maxima: [-Infinity],
				count: Math.max(
					1,
					Math.ceil(
						Math.hypot(top[0] - base[0], top[1] - base[1]) / options.wallSurfaceSampleSpacingMeters
					)
				)
			};
			profiles.set(key, profile);
		}
		const { samples, maxima, count } = profile;
		checkFlightWork(count, FLIGHT_LIMITS.wallSamples, 'Wall profile samples');
		if (height <= 0) return samples[0];
		const targetElevation = samples[0].elevation + height;
		// Extend only as far as requested, so unused terrain is never queried.
		while (maxima[maxima.length - 1] < targetElevation && samples.length <= count) {
			const sample = samples.length;
			const local = [
				base[0] + ((top[0] - base[0]) * sample) / count,
				base[1] + ((top[1] - base[1]) * sample) / count
			];
			const elevation = terrainAt(local);
			samples.push({ local, elevation });
			maxima.push(Math.max(maxima[maxima.length - 1], elevation));
		}
		if (maxima[maxima.length - 1] < targetElevation) return null;
		// Prefix maxima preserve the first crossing even on non-monotonic walls.
		let low = 1;
		let high = samples.length - 1;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (maxima[middle] >= targetElevation) high = middle;
			else low = middle + 1;
		}
		const previous = samples[low - 1];
		const current = samples[low];
		const elevationSpan = current.elevation - previous.elevation;
		const fraction =
			elevationSpan === 0 ? 1 : (targetElevation - previous.elevation) / elevationSpan;
		return {
			local: [
				previous.local[0] + (current.local[0] - previous.local[0]) * fraction,
				previous.local[1] + (current.local[1] - previous.local[1]) * fraction
			],
			elevation: targetElevation
		};
	};
}

function resolveCapturePlacement(
	along: number,
	height: number,
	curveDepth: number,
	lateralOffset: number,
	axis: LocalPoint,
	normal: LocalPoint,
	detectedWall: ReturnType<typeof detectWall>,
	terrainAt: TerrainAt,
	wallSurfacePointAtHeight: ReturnType<typeof createWallSurfaceSampler>,
	options: typeof DEFAULTS
) {
	// Shift a convergent constant-distance pass along the wall before
	// applying the local normal, preserving its horizontal stand-off.
	const frameAlong = options.pattern === 'constant-distance-grid' ? along + lateralOffset : along;
	const wallFrame = wallFrameAt(frameAlong, axis, normal, detectedWall);
	const surfacePoint =
		options.pattern === 'constant-distance-grid'
			? wallSurfacePointAtHeight(wallFrame.target, wallFrame.topTarget, height)
			: null;
	if (options.pattern === 'constant-distance-grid' && !surfacePoint) {
		return null;
	}
	const target = surfacePoint?.local || wallFrame.target;
	let cameraTarget = target;
	if (options.pattern === 'constant-distance-grid' && lateralOffset !== 0) {
		// Placement follows the shifted wall frame to retain stand-off.
		// Aim back at the original coverage sample for a convergent view.
		const captureFrame = wallFrameAt(along, axis, normal, detectedWall);
		const captureSurface = wallSurfacePointAtHeight(
			captureFrame.target,
			captureFrame.topTarget,
			height
		);
		if (!captureSurface) {
			return null;
		}
		cameraTarget = captureSurface.local;
	}
	const local = [
		target[0] +
			(options.pattern === 'constant-distance-grid' ? 0 : wallFrame.axis[0] * lateralOffset) +
			wallFrame.normal[0] * (options.standOffMeters + curveDepth),
		target[1] +
			(options.pattern === 'constant-distance-grid' ? 0 : wallFrame.axis[1] * lateralOffset) +
			wallFrame.normal[1] * (options.standOffMeters + curveDepth)
	];
	// The DEM includes the ground at the wall's toe. Preserve horizontal
	// stand-off while lifting the aircraft above that surface at the base.
	const plannedAltitude = surfacePoint
		? surfacePoint.elevation + options.minimumFaceDistanceMeters + 0.1
		: terrainAt(local) + options.standOffMeters + height;
	const altitude = Math.max(
		plannedAltitude,
		terrainAt(local) + options.minimumGroundClearanceMeters
	);
	return { local, altitude, cameraTarget };
}

/** Check the final straight segments, including connections between rows and passes. */
function validateFlightPath(
	waypoints: Pick<LocalWaypoint, 'local' | 'altitude'>[],
	terrainAt: TerrainAt,
	options: typeof DEFAULTS,
	clearanceAt: (local: number[], altitude: number) => number
): void {
	// Validate every final connection, including row/pass transitions, after clipping
	// and reversal. Never export a direct connection that fails the sampled DEM.
	// Export uses straight segments with a full stop at each waypoint.
	let pathSamples = 0;
	for (let index = 1; index < waypoints.length; index += 1) {
		const first = waypoints[index - 1];
		const second = waypoints[index];
		const from = first.local;
		const to = second.local;
		const distance = Math.hypot(to[0] - from[0], to[1] - from[1], second.altitude - first.altitude);
		const samples = Math.max(1, Math.ceil(distance / (options.terrainMeshSpacingMeters / 2)));
		pathSamples += samples + 1;
		checkFlightWork(pathSamples, FLIGHT_LIMITS.pathSamples, 'Flight path samples');
		// The preceding segment already checked this segment's starting waypoint.
		for (let sample = index === 1 ? 0 : 1; sample <= samples; sample += 1) {
			const fraction = sample / samples;
			const local =
				sample === samples
					? to
					: [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
			const altitude =
				sample === samples
					? second.altitude
					: first.altitude + (second.altitude - first.altitude) * fraction;
			const groundClearance = altitude - terrainAt(local);
			const faceClearance = clearanceAt(local, altitude);
			if (
				groundClearance + 1e-6 < options.minimumGroundClearanceMeters ||
				faceClearance + 1e-6 < options.minimumFaceDistanceMeters
			) {
				throw new RangeError(
					`Unsafe flight path between waypoints ${index} and ${index + 1}: terrain clearance is insufficient. Increase stand-off or change the capture area.`
				);
			}
		}
	}
}

/**
 * Create a terrain-following façade mission with a direct coverage pass and optional convergent
 * pass. The latter shifts the aircraft laterally while looking back to the same surface samples,
 * giving SfM a useful second viewing angle without changing the planned coverage grid.
 */
export function generateFlightPlan(
	geometry: Polygon | null | undefined,
	suppliedOptions: FlightPlanOptions = {}
): FlightPlan {
	const options = validateFlightPlanOptions(suppliedOptions);
	const ring = openRing(geometry);
	const projection = createProjection(ring);
	const localRing = ring.map(projection.toLocal);
	const axis = principalAxis(localRing);
	const principalNormal = [-axis[1], axis[0]];
	const extentAlong = localRing.map((point) => point[0] * axis[0] + point[1] * axis[1]);
	const minAlong = Math.min(...extentAlong);
	const maxAlong = Math.max(...extentAlong);
	const center = [0, 0]; // projection origin is the polygon centroid
	// A bounded, direct-mapped cache avoids per-query Map allocations. Hash
	// collisions replace entries; exact coordinate checks prevent false hits.
	const cacheSize = 65536;
	const cachedLongitudes = new Float64Array(cacheSize);
	const cachedLatitudes = new Float64Array(cacheSize);
	const cachedElevations = new Float64Array(cacheSize);
	const occupied = new Uint8Array(cacheSize);
	const coordinate = new Float64Array(2);
	const coordinateBits = new Uint32Array(coordinate.buffer);
	let terrainQueries = 0;
	const terrainAt = (local: LocalPoint) => {
		checkFlightWork(++terrainQueries, FLIGHT_LIMITS.terrainQueries, 'Terrain evaluations');
		const [longitude, latitude] = projection.toLngLat(local);
		coordinate[0] = longitude;
		coordinate[1] = latitude;
		const hash =
			Math.imul(coordinateBits[0] ^ coordinateBits[1], 0x9e3779b1) ^
			Math.imul(coordinateBits[2] ^ coordinateBits[3], 0x85ebca6b);
		const index = (hash ^ (hash >>> 16)) & (cacheSize - 1);
		if (
			occupied[index] &&
			cachedLongitudes[index] === longitude &&
			cachedLatitudes[index] === latitude
		) {
			return cachedElevations[index];
		}
		const elevation = Number(options.terrainElevationAt(longitude, latitude));
		if (!Number.isFinite(elevation))
			throw new TypeError('terrainElevationAt must return a finite elevation.');
		cachedLongitudes[index] = longitude;
		cachedLatitudes[index] = latitude;
		cachedElevations[index] = elevation;
		occupied[index] = 1;
		return elevation;
	};
	const clearanceAt =
		suppliedOptions.terrainClearanceAt ??
		((local: number[], altitude: number) =>
			terrainSurfaceClearance(
				local,
				altitude,
				terrainAt,
				options.minimumFaceDistanceMeters,
				options.terrainMeshSpacingMeters
			));
	const normal = normalFacingUphill(principalNormal, center, options.standOffMeters, terrainAt);
	const detectedWall = detectWall(localRing, axis, normal, minAlong, maxAlong, options, terrainAt);
	const corridorMinAlong =
		detectedWall.localPoints.length >= 2 ? detectedWall.localPoints[0].along : minAlong;
	const corridorMaxAlong =
		detectedWall.localPoints.length >= 2
			? detectedWall.localPoints[detectedWall.localPoints.length - 1].along
			: maxAlong;
	const corridorWidth = corridorMaxAlong - corridorMinAlong;
	const corridorCenter = (corridorMinAlong + corridorMaxAlong) / 2;
	const corridorHalfWidth = corridorWidth / 2;
	const sectorElevation = sectorElevationRange(localRing, terrainAt);
	const captureHeightMeters = sectorElevation.height;
	const rowCount = Math.max(2, Math.ceil(captureHeightMeters / options.stripSpacingMeters) + 1);
	const rowLength =
		options.pattern === 'facade-grid' || options.pattern === 'constant-distance-grid'
			? corridorWidth
			: Math.PI * corridorHalfWidth;
	const pointsPerRow = Math.max(3, Math.ceil(rowLength / options.pointSpacingMeters) + 1);
	checkFlightWork(
		rowCount * pointsPerRow * options.convergentPasses,
		FLIGHT_LIMITS.waypoints,
		'Capture waypoints'
	);
	const wallSurfacePointAtHeight = createWallSurfaceSampler(terrainAt, options);
	const rows: DraftWaypoint[][] = [];
	let droppedWaypointCount = 0;
	let unresolvedWallSurfaceCount = 0;

	for (let pass = 0; pass < options.convergentPasses; pass += 1) {
		const lateralOffset =
			pass === 0 ? 0 : (pass % 2 === 1 ? 1 : -1) * options.convergentOffsetMeters;
		for (let row = 0; row < rowCount; row += 1) {
			const height = (row / (rowCount - 1)) * captureHeightMeters;
			const rowWaypoints: DraftWaypoint[] = [];
			for (let point = 0; point < pointsPerRow; point += 1) {
				const progress = point / (pointsPerRow - 1);
				const direction = row % 2 === 0 ? progress : 1 - progress;
				const angle = Math.PI * direction;
				const along =
					options.pattern === 'facade-grid' || options.pattern === 'constant-distance-grid'
						? corridorMaxAlong - direction * corridorWidth
						: corridorCenter + Math.cos(angle) * corridorHalfWidth;
				const curveDepth =
					options.pattern === 'half-helix'
						? Math.sin(angle) * corridorHalfWidth * 0.45
						: options.pattern === 'curved-sweep'
							? Math.sin(angle) * options.standOffMeters * 0.2
							: 0;
				const placement = resolveCapturePlacement(
					along,
					height,
					curveDepth,
					lateralOffset,
					axis,
					normal,
					detectedWall,
					terrainAt,
					wallSurfacePointAtHeight,
					options
				);
				if (!placement) {
					unresolvedWallSurfaceCount += 1;
					continue;
				}
				const { local, altitude, cameraTarget } = placement;
				const clearance = clearanceAt(local, altitude);
				if (clearance < options.minimumFaceDistanceMeters) {
					droppedWaypointCount += 1;
					continue;
				}
				rowWaypoints.push({
					local,
					altitude,
					phase: 'capture',
					speed: options.speed,
					heading: headingTo(cameraTarget, local),
					gimbalPitch: -8,
					camera: options.camera,
					sampleIndex: point
				});
			}
			if (rowWaypoints.length) rows.push(rowWaypoints);
		}
	}
	if (rows.reduce((count, row) => count + row.length, 0) < 2) {
		throw new RangeError(
			`No usable flight path remains after enforcing the ${options.minimumFaceDistanceMeters} m cliff-face clearance.`
		);
	}
	const lowestCaptureAltitude = Math.min(
		...rows.map((row) => Math.min(...row.map((waypoint) => waypoint.altitude)))
	);
	const captureAltitudeCeiling =
		lowestCaptureAltitude + captureHeightMeters + options.captureAltitudeToleranceMeters;
	let altitudeCappedWaypointCount = 0;
	const replannedRows: DraftWaypoint[][] = [];
	let fragmentedRowCount = 0;
	let discardedFragmentWaypointCount = 0;
	for (const candidates of rows) {
		const row = candidates.filter((waypoint) => waypoint.altitude <= captureAltitudeCeiling);
		altitudeCappedWaypointCount += candidates.length - row.length;
		if (!row.length) continue;
		const segments = row.reduce<DraftWaypoint[][]>((all, waypoint) => {
			const current = all[all.length - 1];
			if (!current || waypoint.sampleIndex !== current[current.length - 1].sampleIndex + 1) {
				all.push([waypoint]);
			} else {
				current.push(waypoint);
			}
			return all;
		}, []);
		const bestSegment = segments.reduce(
			(best, segment) => (segment.length > best.length ? segment : best),
			segments[0]
		);
		if (segments.length > 1) fragmentedRowCount += 1;
		discardedFragmentWaypointCount += row.length - bestSegment.length;
		replannedRows.push(bestSegment);
	}
	const localWaypoints: LocalWaypoint[] = [];
	let previousWaypoint: DraftWaypoint | null = null;
	for (const row of replannedRows) {
		const first = row[0];
		const last = row[row.length - 1];
		const shouldReverse: boolean =
			previousWaypoint !== null &&
			Math.hypot(
				last.local[0] - previousWaypoint.local[0],
				last.local[1] - previousWaypoint.local[1]
			) <
				Math.hypot(
					first.local[0] - previousWaypoint.local[0],
					first.local[1] - previousWaypoint.local[1]
				);
		const plannedRow: DraftWaypoint[] = shouldReverse ? [...row].reverse() : row;
		plannedRow.forEach(({ sampleIndex: _sampleIndex, ...waypoint }, rowIndex) => {
			localWaypoints.push({
				...waypoint,
				index: localWaypoints.length,
				rowBoundary:
					plannedRow.length === 1
						? 'single'
						: rowIndex === 0
							? 'start'
							: rowIndex === plannedRow.length - 1
								? 'end'
								: null
			});
		});
		previousWaypoint = plannedRow[plannedRow.length - 1];
	}
	if (localWaypoints.length < 2) {
		throw new RangeError(
			`No usable flight path remains after enforcing the ${options.minimumFaceDistanceMeters} m cliff-face clearance.`
		);
	}
	validateFlightPath(localWaypoints, terrainAt, options, clearanceAt);
	const waypoints: FlightWaypoint[] = localWaypoints.map(({ local, ...waypoint }) => {
		const [longitude, latitude] = projection.toLngLat(local);
		return { ...waypoint, longitude, latitude };
	});
	return {
		name: suppliedOptions.name || 'Crag capture plan',
		cragName: suppliedOptions.cragName || '',
		previewWaypointIndex: waypoints[0].index,
		metadata: {
			...(suppliedOptions.startElevation !== undefined
				? { startElevation: suppliedOptions.startElevation }
				: {}),
			camera: options.camera,
			photoCount: waypoints.length,
			pattern: options.pattern,
			strategy: 'terrain-following-facade-with-convergent-pass',
			targetGsdCm: options.targetGsdCm,
			standOffMeters: options.standOffMeters,
			terrainSource: 'https://tiles.mapterhorn.com/tilejson.json',
			captureHeightMeters,
			sectorMinimumElevation: sectorElevation.minimum,
			sectorMaximumElevation: sectorElevation.maximum,
			stripSpacingMeters: options.stripSpacingMeters,
			minimumFaceDistanceMeters: options.minimumFaceDistanceMeters,
			minimumGroundClearanceMeters: options.minimumGroundClearanceMeters,
			captureAltitudeToleranceMeters: options.captureAltitudeToleranceMeters,
			lowestCaptureAltitude,
			captureAltitudeCeiling,
			altitudeCappedWaypointCount,
			unresolvedWallSurfaceCount,
			fragmentedRowCount,
			discardedFragmentWaypointCount,
			terrainMeshSpacingMeters: options.terrainMeshSpacingMeters,
			convergentPasses: options.convergentPasses,
			convergentOffsetMeters: options.convergentOffsetMeters,
			droppedWaypointCount
		},
		wallDetection: {
			confidence: detectedWall.confidence,
			averageSlope: detectedWall.averageSlope,
			shape: detectedWall.shape,
			deviationMeters: detectedWall.deviationMeters,
			coordinates: detectedWall.localPoints.map(({ local }) => projection.toLngLat(local)),
			topCoordinates: detectedWall.localPoints.map(({ topLocal }) => projection.toLngLat(topLocal)),
			samples: detectedWall.samplePoints.map(({ local, slope }) => ({
				coordinates: projection.toLngLat(local),
				slope
			}))
		},
		waypoints
	};
}

export function validateFlightPlanOptions(suppliedOptions: FlightPlanOptions = {}) {
	const options = { ...DEFAULTS, ...suppliedOptions };
	for (const key of [
		'stripSpacingMeters',
		'pointSpacingMeters',
		'speed',
		'transitSpeed'
	] as const) {
		if (!Number.isFinite(options[key]) || options[key] <= 0) {
			throw new TypeError(`${key} must be greater than zero.`);
		}
	}
	if (
		!['facade-grid', 'constant-distance-grid', 'half-helix', 'curved-sweep'].includes(
			options.pattern
		)
	) {
		throw new TypeError(
			'pattern must be "facade-grid", "constant-distance-grid", "half-helix" or "curved-sweep".'
		);
	}
	if (
		!Number.isFinite(options.minimumFaceDistanceMeters) ||
		options.minimumFaceDistanceMeters < 1
	) {
		throw new TypeError('minimumFaceDistanceMeters must be at least 1 metre.');
	}
	if (!Number.isFinite(options.standOffMeters) || options.standOffMeters < 1) {
		throw new TypeError('standOffMeters must be at least 1 metre.');
	}
	if (
		!Number.isFinite(options.minimumGroundClearanceMeters) ||
		options.minimumGroundClearanceMeters < 3
	) {
		throw new TypeError('minimumGroundClearanceMeters must be at least 3 metres.');
	}
	if (!Number.isFinite(options.terrainMeshSpacingMeters) || options.terrainMeshSpacingMeters <= 0) {
		throw new TypeError('terrainMeshSpacingMeters must be greater than zero.');
	}
	if (
		!Number.isFinite(options.captureAltitudeToleranceMeters) ||
		options.captureAltitudeToleranceMeters < 0
	) {
		throw new TypeError('captureAltitudeToleranceMeters must be zero or greater.');
	}
	if (
		!Number.isFinite(options.wallDetectionSpacingMeters) ||
		options.wallDetectionSpacingMeters <= 0 ||
		!Number.isFinite(options.wallDetectionCrossSectionSpacingMeters) ||
		options.wallDetectionCrossSectionSpacingMeters <= 0 ||
		!Number.isFinite(options.minimumWallSlope) ||
		options.minimumWallSlope < 0
	) {
		throw new TypeError(
			'Wall detection spacing and minimum slope must be valid non-negative values.'
		);
	}
	if (
		!Number.isFinite(options.wallSurfaceSampleSpacingMeters) ||
		options.wallSurfaceSampleSpacingMeters <= 0
	) {
		throw new TypeError('Wall surface sampling spacing must be greater than zero.');
	}
	if (!Number.isInteger(options.convergentPasses) || options.convergentPasses < 1) {
		throw new TypeError('convergentPasses must be a positive integer.');
	}
	if (!Number.isFinite(options.convergentOffsetMeters) || options.convergentOffsetMeters < 0) {
		throw new TypeError('convergentOffsetMeters must be zero or greater.');
	}
	if (
		suppliedOptions.startElevation !== undefined &&
		!Number.isFinite(suppliedOptions.startElevation)
	) {
		throw new TypeError('Launch elevation must be a finite number in metres AMSL.');
	}
	return options;
}

/** Conservative coverage for every supported pattern, plus the complete clearance stencil. */
export function flightPlanTerrainBounds(
	geometry: Polygon,
	suppliedOptions: FlightPlanOptions = {}
) {
	const ring = openRing(geometry);
	const projection = createProjection(ring);
	const points = ring.map(projection.toLocal);
	const axis = principalAxis(points);
	const normal = [-axis[1], axis[0]];
	const options = validateFlightPlanOptions(suppliedOptions);
	const along = points.map((p) => p[0] * axis[0] + p[1] * axis[1]);
	const across = points.map((p) => p[0] * normal[0] + p[1] * normal[1]);
	const curve =
		options.pattern === 'half-helix'
			? (Math.max(...along) - Math.min(...along)) * 0.225
			: options.pattern === 'curved-sweep'
				? options.standOffMeters * 0.2
				: 0;
	const stencil =
		Math.ceil(
			(options.minimumFaceDistanceMeters + options.terrainMeshSpacingMeters) /
				options.terrainMeshSpacingMeters
		) * options.terrainMeshSpacingMeters;
	const pad =
		Math.max(options.standOffMeters, 10) +
		curve +
		options.convergentOffsetMeters +
		stencil * Math.SQRT2 +
		2;
	const corners = [];
	for (const a of [Math.min(...along) - pad, Math.max(...along) + pad]) {
		for (const b of [Math.min(0, ...across) - pad, Math.max(0, ...across) + pad]) {
			corners.push(projection.toLngLat([axis[0] * a + normal[0] * b, axis[1] * a + normal[1] * b]));
		}
	}
	return {
		origin: projection.origin,
		west: Math.min(...corners.map((p) => p[0])),
		east: Math.max(...corners.map((p) => p[0])),
		south: Math.min(...corners.map((p) => p[1])),
		north: Math.max(...corners.map((p) => p[1]))
	};
}
