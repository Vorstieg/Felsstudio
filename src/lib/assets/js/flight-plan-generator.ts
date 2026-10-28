/**
 * Deterministic, terrain-relative capture plans for a sector footprint.
 *
 * A sector polygon supplies the face extent and the MapTerhorn DEM supplies the estimated 3D
 * surface. Local profiles include the complete detected face and its crest. Camera footprints
 * bound capture spacing; aircraft and sightlines are checked against the sampled terrain. Altitude in the result is AMSL.
 */

import type { FlightPlan, FlightWaypoint } from './flight-plan-types.ts';
import type { Polygon } from 'geojson';
import { terrainSurfaceClearance } from './flight-plan-terrain.ts';
import { FLIGHT_LIMITS, checkFlightWork } from './flight-plan-limits.ts';
import {
	cameraFootprint,
	cameraDistanceAtGsd,
	cameraContainsTarget,
	flightCamera,
	selectCoverageCamera
} from './flight-plan-camera.ts';

type LocalWaypoint = Omit<FlightWaypoint, 'longitude' | 'latitude'> & { local: LocalPoint };
type DraftWaypoint = Omit<LocalWaypoint, 'index' | 'rowBoundary'> & {
	sampleIndex: number;
	coverageKey: string;
};
type WallCandidate = { along: number; across: number; topAcross: number; slope: number };
type LocalPoint = number[];
type TerrainAt = (point: LocalPoint) => number;

const EARTH_RADIUS_METERS = 6378137;
const DEFAULTS = {
	pattern: 'facade-grid',
	targetGsdCm: 0.5,
	standOffMeters: 2,
	speed: 2.5,
	transitSpeed: 5,
	camera: 'auto',
	captureOverlap: 0.7,
	clearanceMarginMeters: 1,
	minimumFaceDistanceMeters: 2,
	minimumGroundClearanceMeters: 3,
	captureAltitudeToleranceMeters: 5,
	terrainMeshSpacingMeters: 1,
	wallDetectionSpacingMeters: 1,
	wallDetectionCrossSectionSpacingMeters: 0.5,
	minimumWallSlope: 0.5,
	wallSurfaceSampleSpacingMeters: 0.5,
	obliqueOffsetMeters: 2,
	terrainElevationAt: (_longitude: number, _latitude: number) => 0
};

export type FlightPlanOptions = Partial<Omit<typeof DEFAULTS, 'terrainElevationAt'>> & {
	name?: string;
	cragName?: string;
	/** Optional upper bounds; automatic planning uses the camera footprint. */
	pointSpacingMeters?: number;
	stripSpacingMeters?: number;
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
	const ring = geometry.coordinates[0];
	if (
		ring.some(
			(point) =>
				!Array.isArray(point) ||
				!Number.isFinite(point[0]) ||
				!Number.isFinite(point[1]) ||
				Math.abs(point[0]) > 180 ||
				Math.abs(point[1]) > 90
		)
	) {
		throw new TypeError('The sector polygon must contain finite WGS84 coordinates.');
	}
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
		if (!range || range[1] - range[0] < 1e-6) continue;
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
		if (!Number.isFinite(steepest.slope) || steepest.slope < options.minimumWallSlope) continue;

		// Use every steep band in the selected section. Stopping at the first
		// terrace would omit ledges and the upper part of a structured wall.
		const downhillDirection = steepest.elevationChange <= 0 ? 1 : -1;
		const steepIndices = slopeSamples.flatMap((sample, index) =>
			sample.slope >= options.minimumWallSlope ? [index] : []
		);
		const firstSteep = steepIndices[0];
		const lastSteep = steepIndices[steepIndices.length - 1];
		const baseIndex = downhillDirection > 0 ? lastSteep : firstSteep;
		const topIndex = downhillDirection > 0 ? firstSteep : lastSteep;
		const baseSample = slopeSamples[baseIndex];
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
	type Sample = { local: LocalPoint; elevation: number; distance: number };
	const profiles = new Map<string, Sample[]>();
	return (base: LocalPoint, top: LocalPoint, fraction: number) => {
		const key = `${base[0]}:${base[1]}:${top[0]}:${top[1]}`;
		let samples = profiles.get(key);
		if (!samples) {
			const count = Math.max(
				1,
				Math.ceil(
					Math.hypot(top[0] - base[0], top[1] - base[1]) / options.wallSurfaceSampleSpacingMeters
				)
			);
			checkFlightWork(count, FLIGHT_LIMITS.wallSamples, 'Wall profile samples');
			samples = [{ local: base, elevation: terrainAt(base), distance: 0 }];
			for (let index = 1; index <= count; index++) {
				const local = [
					base[0] + ((top[0] - base[0]) * index) / count,
					base[1] + ((top[1] - base[1]) * index) / count
				];
				const elevation = terrainAt(local);
				const previous = samples[index - 1];
				samples.push({
					local,
					elevation,
					distance:
						previous.distance +
						Math.hypot(
							local[0] - previous.local[0],
							local[1] - previous.local[1],
							elevation - previous.elevation
						)
				});
			}
			profiles.set(key, samples);
		}
		const length = samples[samples.length - 1].distance;
		if (fraction <= 0 || length === 0) return { ...samples[0], length };
		if (fraction >= 1) return { ...samples[samples.length - 1], length };
		const distance = fraction * length;
		let low = 1,
			high = samples.length - 1;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (samples[middle].distance >= distance) high = middle;
			else low = middle + 1;
		}
		const first = samples[low - 1],
			second = samples[low];
		const ratio = (distance - first.distance) / (second.distance - first.distance);
		const local = [
			first.local[0] + (second.local[0] - first.local[0]) * ratio,
			first.local[1] + (second.local[1] - first.local[1]) * ratio
		];
		return { local, elevation: terrainAt(local), length };
	};
}

/** Target a short band behind the lip, clipped to the selected footprint. */
function crestSurfaceTarget(
	along: number,
	frame: ReturnType<typeof wallFrameAt>,
	surfaceAt: ReturnType<typeof createWallSurfaceSampler>,
	terrainAt: TerrainAt,
	localRing: LocalPoint[],
	axis: LocalPoint,
	normal: LocalPoint,
	standOff: number
) {
	const crest = surfaceAt(frame.target, frame.topTarget, 1);
	const range = crossSectionRange(localRing, axis, normal, along);
	const direction =
		(frame.topTarget[0] - frame.target[0]) * normal[0] +
		(frame.topTarget[1] - frame.target[1]) * normal[1];
	if (!range || Math.abs(direction) < 1e-6) return crest;
	const across = clamp(
		crest.local[0] * normal[0] +
			crest.local[1] * normal[1] +
			Math.sign(direction) * Math.min(2, standOff / 4),
		range[0],
		range[1]
	);
	const local = [axis[0] * along + normal[0] * across, axis[1] * along + normal[1] * across];
	return { ...crest, local, elevation: terrainAt(local) };
}

function resolveCapturePlacement(
	along: number,
	fraction: number,
	curveDepth: number,
	lateralOffset: number,
	axis: LocalPoint,
	normal: LocalPoint,
	detectedWall: ReturnType<typeof detectWall>,
	terrainAt: TerrainAt,
	surfaceAt: ReturnType<typeof createWallSurfaceSampler>,
	options: typeof DEFAULTS,
	crest: boolean,
	localRing: LocalPoint[]
) {
	const offset = lateralOffset * (1 + curveDepth / options.standOffMeters);
	const captureFrame = wallFrameAt(along, axis, normal, detectedWall);
	const cameraTarget = crest
		? crestSurfaceTarget(
				along,
				captureFrame,
				surfaceAt,
				terrainAt,
				localRing,
				axis,
				normal,
				options.standOffMeters
			)
		: surfaceAt(captureFrame.target, captureFrame.topTarget, fraction);
	const frameAlong = options.pattern === 'constant-distance-grid' ? along + offset : along;
	const frame = wallFrameAt(frameAlong, axis, normal, detectedWall);
	const points = detectedWall.localPoints;
	const endOffset =
		options.pattern === 'constant-distance-grid' && points.length >= 2
			? frameAlong - clamp(frameAlong, points[0].along, points[points.length - 1].along)
			: 0;
	const surface = surfaceAt(frame.target, frame.topTarget, fraction);
	const target = options.pattern === 'constant-distance-grid' ? surface.local : frame.target;
	const local = [
		target[0] +
			frame.axis[0] * (options.pattern === 'constant-distance-grid' ? endOffset : offset) +
			frame.normal[0] * (options.standOffMeters + curveDepth),
		target[1] +
			frame.axis[1] * (options.pattern === 'constant-distance-grid' ? endOffset : offset) +
			frame.normal[1] * (options.standOffMeters + curveDepth)
	];
	const altitude = Math.max(
		surface.elevation +
			(crest ? Math.max(options.standOffMeters, options.minimumGroundClearanceMeters) : 0),
		terrainAt(local) + options.minimumGroundClearanceMeters + options.clearanceMarginMeters
	);
	return { local, altitude, cameraTarget };
}

function cameraCanSeeTarget(
	local: LocalPoint,
	altitude: number,
	target: { local: LocalPoint; elevation: number },
	terrainAt: TerrainAt,
	spacing: number
) {
	const distance = Math.hypot(target.local[0] - local[0], target.local[1] - local[1]);
	const count = Math.max(1, Math.ceil(distance / spacing));
	checkFlightWork(count, FLIGHT_LIMITS.pathSamples, 'Camera sightline samples');
	for (let index = 1; index < count; index++) {
		const fraction = index / count;
		const point = [
			local[0] + (target.local[0] - local[0]) * fraction,
			local[1] + (target.local[1] - local[1]) * fraction
		];
		if (altitude + (target.elevation - altitude) * fraction + 0.05 < terrainAt(point)) return false;
	}
	return true;
}

function fitCaptureView(
	placement: ReturnType<typeof resolveCapturePlacement>,
	options: typeof DEFAULTS,
	terrainAt: TerrainAt,
	clearanceAt: (local: number[], altitude: number) => number
) {
	const requiredClearance = options.minimumFaceDistanceMeters + options.clearanceMarginMeters;
	const { local, cameraTarget } = placement;
	const horizontal = Math.hypot(cameraTarget.local[0] - local[0], cameraTarget.local[1] - local[1]);
	for (const lift of [0, requiredClearance, options.standOffMeters]) {
		const altitude = placement.altitude + lift;
		const pitch = toDegrees(Math.atan2(cameraTarget.elevation - altitude, horizontal));
		const distance = Math.hypot(horizontal, cameraTarget.elevation - altitude);
		if (pitch < -90 || pitch > 70 || distance < flightCamera(options.camera).minimumFocus) continue;
		if (!(clearanceAt(local, altitude) + 1e-6 >= requiredClearance)) continue;
		if (
			!cameraCanSeeTarget(
				local,
				altitude,
				cameraTarget,
				terrainAt,
				Math.min(options.wallSurfaceSampleSpacingMeters, 0.25)
			)
		)
			continue;
		return { altitude, pitch, distance, heading: headingTo(cameraTarget.local, local) };
	}
	return null;
}

class UnsafeFlightPathError extends RangeError {}

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
		const samples = Math.max(
			1,
			Math.ceil(distance / Math.min(options.terrainMeshSpacingMeters / 4, 0.25))
		);
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
				groundClearance + 1e-6 <
					options.minimumGroundClearanceMeters + options.clearanceMarginMeters ||
				faceClearance + 1e-6 < options.minimumFaceDistanceMeters + options.clearanceMarginMeters
			) {
				throw new UnsafeFlightPathError(
					`Unsafe flight path between waypoints ${index} and ${index + 1}: terrain clearance is insufficient. Increase stand-off or change the capture area.`
				);
			}
		}
	}
}

/** Keep capture positions fixed and bridge blocked connections with photo-free transits. */
function connectFlightCaptures(
	waypoints: LocalWaypoint[],
	terrainAt: TerrainAt,
	options: typeof DEFAULTS,
	clearanceAt: (local: number[], altitude: number) => number
): LocalWaypoint[] {
	const connected = [waypoints[0]];
	for (let index = 1; index < waypoints.length; index++) {
		const first = waypoints[index - 1];
		const second = waypoints[index];
		try {
			validateFlightPath([first, second], terrainAt, options, clearanceAt);
		} catch (error) {
			if (!(error instanceof UnsafeFlightPathError)) throw error;
			const samples = Math.max(
				1,
				Math.ceil(
					Math.hypot(second.local[0] - first.local[0], second.local[1] - first.local[1]) /
						(options.terrainMeshSpacingMeters / 2)
				)
			);
			checkFlightWork(samples, FLIGHT_LIMITS.pathSamples, 'Transit path samples');
			let highestTerrain = -Infinity;
			for (let sample = 0; sample <= samples; sample++) {
				const fraction = sample / samples;
				highestTerrain = Math.max(
					highestTerrain,
					terrainAt([
						first.local[0] + (second.local[0] - first.local[0]) * fraction,
						first.local[1] + (second.local[1] - first.local[1]) * fraction
					])
				);
			}
			const altitude =
				Math.max(first.altitude, second.altitude, highestTerrain) +
				options.minimumGroundClearanceMeters +
				options.minimumFaceDistanceMeters +
				2 * options.clearanceMarginMeters;
			let detour: LocalWaypoint[] | null = null;
			for (const offset of [
				0,
				options.minimumFaceDistanceMeters + options.minimumGroundClearanceMeters,
				Math.max(options.standOffMeters, 10)
			]) {
				const transit = [first, second].map((waypoint) => ({
					...waypoint,
					altitude,
					phase: 'transit' as const,
					local: [
						waypoint.local[0] - Math.sin(toRadians(waypoint.heading)) * offset,
						waypoint.local[1] - Math.cos(toRadians(waypoint.heading)) * offset
					],
					speed: options.transitSpeed,
					rowBoundary: null,
					detailCamera: undefined,
					captureTarget: undefined,
					captureView: undefined,
					captureKind: undefined
				}));
				try {
					validateFlightPath([first, ...transit, second], terrainAt, options, clearanceAt);
					detour = transit;
					break;
				} catch (detourError) {
					if (!(detourError instanceof UnsafeFlightPathError)) throw detourError;
				}
			}
			if (!detour) throw error;
			connected.push(...detour);
		}
		connected.push(second);
		checkFlightWork(connected.length, FLIGHT_LIMITS.waypoints, 'Flight waypoints');
	}
	return connected.map((waypoint, index) => ({ ...waypoint, index }));
}

/**
 * Create one overlapping capture grid, adding only the extra viewpoints needed
 * to satisfy the modeled surface coverage and independent-view requirements.
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
	const corridorHalfWidth = corridorWidth / 2;
	const sectorElevation = sectorElevationRange(localRing, terrainAt);
	const captureHeightMeters = sectorElevation.height;
	const surfaceAt = createWallSurfaceSampler(terrainAt, options);
	const footprint = cameraFootprint(options.camera, options.standOffMeters);
	// Keep the requested image overlap. Actual camera frusta and sightlines
	// validate coverage below, without an additional blanket density reserve.
	const pointSpacing = Math.min(
		options.pointSpacingMeters ?? Infinity,
		footprint.width * (1 - options.captureOverlap)
	);
	const stripSpacing = Math.min(
		options.stripSpacingMeters ?? Infinity,
		footprint.height * (1 - options.captureOverlap)
	);
	const pointCount = Math.max(3, Math.ceil(corridorWidth / pointSpacing) + 1);
	checkFlightWork(pointCount, FLIGHT_LIMITS.waypoints, 'Capture waypoints');
	const alongPositions = Array.from(
		{ length: pointCount },
		(_, index) => corridorMinAlong + (corridorWidth * index) / (pointCount - 1)
	);
	const targetAt = (along: number, fraction: number) => {
		const frame = wallFrameAt(along, axis, normal, detectedWall);
		return surfaceAt(frame.target, frame.topTarget, fraction);
	};
	const crestAt = (along: number) =>
		crestSurfaceTarget(
			along,
			wallFrameAt(along, axis, normal, detectedWall),
			surfaceAt,
			terrainAt,
			localRing,
			axis,
			normal,
			options.standOffMeters
		);
	// Refine lateral intervals where varying wall height or shape stretches the
	// surface beyond the selected camera's overlapping footprint.
	for (let index = 1; index < alongPositions.length; index++) {
		let gap = 0;
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			const first = targetAt(alongPositions[index - 1], fraction);
			const second = targetAt(alongPositions[index], fraction);
			gap = Math.max(
				gap,
				Math.hypot(
					second.local[0] - first.local[0],
					second.local[1] - first.local[1],
					second.elevation - first.elevation
				)
			);
		}
		if (
			gap > pointSpacing * 1.01 &&
			alongPositions[index] - alongPositions[index - 1] > options.wallSurfaceSampleSpacingMeters
		) {
			checkFlightWork(alongPositions.length + 1, FLIGHT_LIMITS.waypoints, 'Capture waypoints');
			alongPositions.splice(index, 0, (alongPositions[index - 1] + alongPositions[index]) / 2);
			index--;
		}
	}
	const profileLength = Math.max(...alongPositions.map((along) => targetAt(along, 1).length));
	const rowCount = Math.max(2, Math.ceil(profileLength / stripSpacing) + 1);
	const crestRows = detectedWall.localPoints.length >= 2 ? 1 : 0;
	const pointsPerRow = alongPositions.length;
	checkFlightWork(rowCount * pointsPerRow, FLIGHT_LIMITS.waypoints, 'Capture waypoints');
	const rows: DraftWaypoint[][] = [];
	let droppedWaypointCount = 0;
	const unresolvedWallSurfaceCount = 0;
	const curveAt = (column: number) => {
		const angle = (Math.PI * column) / (pointsPerRow - 1);
		return options.pattern === 'half-helix'
			? Math.sin(angle) * corridorHalfWidth * 0.45
			: options.pattern === 'curved-sweep'
				? Math.sin(angle) * options.standOffMeters * 0.2
				: 0;
	};
	for (let row = 0; row < rowCount; row++) {
		const fraction = row / (rowCount - 1);
		const rowWaypoints: DraftWaypoint[] = [];
		for (let point = 0; point < pointsPerRow; point++) {
			const column = row % 2 === 0 ? pointsPerRow - 1 - point : point;
			const placement = resolveCapturePlacement(
				alongPositions[column],
				fraction,
				curveAt(column),
				0,
				axis,
				normal,
				detectedWall,
				terrainAt,
				surfaceAt,
				options,
				false,
				localRing
			);
			const pose = fitCaptureView(placement, options, terrainAt, clearanceAt);
			if (!pose) {
				droppedWaypointCount++;
				continue;
			}
			const { altitude, pitch, distance, heading } = pose;
			const { local, cameraTarget } = placement;
			const [longitude, latitude] = projection.toLngLat(cameraTarget.local);
			rowWaypoints.push({
				local,
				altitude,
				phase: 'capture',
				speed: options.speed,
				heading,
				gimbalPitch: pitch,
				camera: options.camera,
				detailCamera:
					options.camera !== 'tele-6x' &&
					distance >= flightCamera('tele-6x').minimumFocus &&
					column % 4 === 0 &&
					(row === rowCount - 1 || row % 4 === 0)
						? 'tele-6x'
						: undefined,
				captureTarget: { longitude, latitude, altitude: cameraTarget.elevation },
				captureView: 'face',
				captureKind: 'grid',
				sampleIndex: point,
				coverageKey: `${row}:${column}`
			});
		}
		if (rowWaypoints.length) rows.push(rowWaypoints);
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
		Math.max(...alongPositions.map((along) => targetAt(along, 1).elevation)) +
		Math.max(options.standOffMeters, options.minimumGroundClearanceMeters) +
		options.standOffMeters +
		options.minimumGroundClearanceMeters +
		options.clearanceMarginMeters +
		options.captureAltitudeToleranceMeters;
	let altitudeCappedWaypointCount = 0;
	const replannedRows: DraftWaypoint[][] = [];
	let fragmentedRowCount = 0;
	const discardedFragmentWaypointCount = 0;
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
		if (segments.length > 1) fragmentedRowCount++;
		replannedRows.push(...segments);
	}
	const targetViews = new Map<string, LocalWaypoint[]>();
	const localWaypoints: LocalWaypoint[] = [];
	const gridByPose = new Map<string, LocalWaypoint>();
	const poseKey = (waypoint: DraftWaypoint) =>
		`${waypoint.local[0]}:${waypoint.local[1]}:${waypoint.altitude}:${waypoint.heading}:${waypoint.gimbalPitch}:${waypoint.camera}`;
	let previousWaypoint: DraftWaypoint | null = null;
	for (const row of replannedRows) {
		const first = row[0],
			last = row[row.length - 1];
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
		const seen = new Set<string>();
		const fresh = plannedRow.filter((waypoint) => {
			const key = poseKey(waypoint);
			if (gridByPose.has(key) || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		fresh.forEach(
			({ sampleIndex: _sampleIndex, coverageKey: _coverageKey, ...waypoint }, rowIndex) => {
				const view: LocalWaypoint = {
					...waypoint,
					index: localWaypoints.length,
					rowBoundary:
						fresh.length === 1
							? 'single'
							: rowIndex === 0
								? 'start'
								: rowIndex === fresh.length - 1
									? 'end'
									: null
				};
				gridByPose.set(poseKey(fresh[rowIndex]), view);
				localWaypoints.push(view);
			}
		);
		for (const waypoint of plannedRow) {
			const view = gridByPose.get(poseKey(waypoint))!;
			view.detailCamera ||= waypoint.detailCamera;
			targetViews.set(waypoint.coverageKey, [view]);
		}
		if (fresh.length) previousWaypoint = fresh[fresh.length - 1];
	}

	if (localWaypoints.length < 2) {
		throw new RangeError(
			`No usable flight path remains after enforcing the ${options.minimumFaceDistanceMeters} m cliff-face clearance.`
		);
	}

	const requiredViews = 2;
	type SurfaceTarget = ReturnType<typeof targetAt>;
	type CoverageRegion = {
		row: number;
		column: number;
		fraction: number;
		along: number;
		center: SurfaceTarget;
		probes: SurfaceTarget[];
		top: boolean;
	};
	const extraViews: LocalWaypoint[] = [];
	const insertions = new Map<number, LocalWaypoint[]>();
	const regions: CoverageRegion[] = [];
	const nodeRegions: CoverageRegion[] = [];
	for (let row = 0; row < rowCount + crestRows; row++) {
		for (let column = 0; column < pointsPerRow; column++) {
			const top = row === rowCount;
			const fraction = top ? 1 : row / (rowCount - 1);
			const center = top
				? crestAt(alongPositions[column])
				: targetAt(alongPositions[column], fraction);
			nodeRegions.push({
				row,
				column,
				fraction,
				along: alongPositions[column],
				center,
				probes: [center],
				top
			});
		}
	}
	for (let row = 0; row < rowCount - 1 + crestRows; row++) {
		for (let column = 0; column < pointsPerRow - 1; column++) {
			const top = row === rowCount - 1;
			const along = (alongPositions[column] + alongPositions[column + 1]) / 2;
			const fraction = top ? 1 : (row + 0.5) / (rowCount - 1);
			let center = targetAt(along, fraction);
			if (top) {
				const inset = crestAt(along);
				const local = [
					(center.local[0] + inset.local[0]) / 2,
					(center.local[1] + inset.local[1]) / 2
				];
				center = { ...center, local, elevation: terrainAt(local) };
			}
			const corners = [
				[row, column],
				[row, column + 1],
				[row + 1, column],
				[row + 1, column + 1]
			];
			const probes = [
				...corners.map(([r, c]) =>
					r === rowCount
						? crestAt(alongPositions[c])
						: targetAt(alongPositions[c], r / (rowCount - 1))
				),
				center
			];
			regions.push({ row, column, fraction, along, center, probes, top });
		}
	}
	const nearbyViews = (region: CoverageRegion) => {
		const views: LocalWaypoint[] = [];
		// Overlapping neighboring photos already provide different camera
		// positions. They count even when aimed at other surface samples.
		for (
			let row = Math.max(0, region.row - 2);
			row <= Math.min(rowCount - 1, region.row + 2);
			row++
		) {
			for (
				let column = Math.max(0, region.column - 2);
				column <= Math.min(pointsPerRow - 1, region.column + 2);
				column++
			) {
				views.push(...(targetViews.get(`${row}:${column}`) ?? []));
			}
		}
		return [...views, ...extraViews];
	};
	const viewDirection = (view: LocalWaypoint, target: SurfaceTarget) => {
		const delta = [
			target.local[0] - view.local[0],
			target.local[1] - view.local[1],
			target.elevation - view.altitude
		];
		const length = Math.hypot(...delta);
		return delta.map((value) => value / length);
	};
	const separated = (first: number[], second: number[]) =>
		first.reduce((sum, value, axis) => sum + value * second[axis], 0) < Math.cos(toRadians(8));
	const covers = (view: LocalWaypoint, region: CoverageRegion) => {
		if (region.top) {
			// A level ray along the plateau is not a useful view of its top.
			const horizontal = Math.hypot(
				region.center.local[0] - view.local[0],
				region.center.local[1] - view.local[1]
			);
			if (
				view.altitude - Math.max(...region.probes.map((probe) => probe.elevation)) <
				horizontal * Math.tan(toRadians(20))
			)
				return false;
		}
		if (
			!region.probes.every((probe) =>
				cameraContainsTarget(
					view.camera,
					[...view.local, view.altitude],
					view.heading,
					view.gimbalPitch,
					[...probe.local, probe.elevation]
				)
			)
		)
			return false;
		return region.probes.every((probe) =>
			cameraCanSeeTarget(
				view.local,
				view.altitude,
				probe,
				terrainAt,
				Math.min(options.wallSurfaceSampleSpacingMeters, 0.25)
			)
		);
	};
	const coveringViews = (region: CoverageRegion) => {
		const visible: LocalWaypoint[] = [];
		for (const view of nearbyViews(region)) {
			if (!covers(view, region)) continue;
			const partner = visible.find((previous) =>
				separated(viewDirection(previous, region.center), viewDirection(view, region.center))
			);
			if (partner) return [partner, view];
			visible.push(view);
		}
		return visible.slice(0, 1);
	};
	// Cells first, then any remaining boundary samples. Every added photo
	// must resolve a concrete visibility, frustum or viewing-angle deficit.
	for (const region of [...regions, ...nodeRegions]) {
		const accepted = coveringViews(region);
		if (accepted.length >= requiredViews) continue;
		const candidates = [
			{ offset: 0, lift: 0 },
			{ offset: options.obliqueOffsetMeters, lift: 0 },
			{ offset: -options.obliqueOffsetMeters, lift: 0 },
			{ offset: 0, lift: options.standOffMeters / 2 },
			{ offset: options.obliqueOffsetMeters, lift: options.standOffMeters / 2 },
			{ offset: -options.obliqueOffsetMeters, lift: options.standOffMeters / 2 }
		];
		for (const candidate of candidates) {
			const placement = resolveCapturePlacement(
				region.along,
				region.fraction,
				curveAt(region.column + (region.probes.length === 1 ? 0 : 0.5)),
				candidate.offset,
				axis,
				normal,
				detectedWall,
				terrainAt,
				surfaceAt,
				options,
				region.top,
				localRing
			);
			placement.altitude += candidate.lift;
			const pose = fitCaptureView(placement, options, terrainAt, clearanceAt);
			if (!pose) continue;
			const [longitude, latitude] = projection.toLngLat(placement.cameraTarget.local);
			const view: LocalWaypoint = {
				local: placement.local,
				altitude: pose.altitude,
				heading: pose.heading,
				gimbalPitch: pose.pitch,
				phase: 'capture',
				speed: options.speed,
				camera: options.camera,
				captureTarget: { longitude, latitude, altitude: placement.cameraTarget.elevation },
				captureView: region.top ? 'crest' : 'face',
				captureKind: 'supplementary',
				index: localWaypoints.length + extraViews.length,
				rowBoundary: 'single'
			};
			if (
				accepted.some(
					(previous) =>
						!separated(viewDirection(previous, region.center), viewDirection(view, region.center))
				) ||
				!covers(view, region)
			)
				continue;
			const reference = localWaypoints.reduce((best, waypoint) =>
				Math.hypot(
					waypoint.local[0] - view.local[0],
					waypoint.local[1] - view.local[1],
					waypoint.altitude - view.altitude
				) <
				Math.hypot(
					best.local[0] - view.local[0],
					best.local[1] - view.local[1],
					best.altitude - view.altitude
				)
					? waypoint
					: best
			);
			const inserted = insertions.get(reference.index) ?? [];
			inserted.push(view);
			insertions.set(reference.index, inserted);
			extraViews.push(view);
			accepted.push(view);
			checkFlightWork(
				localWaypoints.length + extraViews.length,
				FLIGHT_LIMITS.waypoints,
				'Capture waypoints'
			);
			if (accepted.length >= requiredViews) break;
		}
	}
	const coverageTargetCount = nodeRegions.length;
	const coveredTargetCount = nodeRegions.filter(
		(region) => coveringViews(region).length >= requiredViews
	).length;
	const coveredCrestTargetCount = nodeRegions.filter(
		(region) => region.top && coveringViews(region).length >= requiredViews
	).length;
	const spacingGapCount = regions.filter(
		(region) => coveringViews(region).length < requiredViews
	).length;

	const orderedCaptures = localWaypoints.flatMap((waypoint) => [
		waypoint,
		...(insertions.get(waypoint.index) ?? [])
	]);
	const connectedWaypoints = connectFlightCaptures(
		orderedCaptures,
		terrainAt,
		options,
		clearanceAt
	);
	validateFlightPath(connectedWaypoints, terrainAt, options, clearanceAt);
	const waypoints: FlightWaypoint[] = connectedWaypoints.map(({ local, ...waypoint }) => {
		const [longitude, latitude] = projection.toLngLat(local);
		return { ...waypoint, longitude, latitude };
	});
	const detailPhotoCount = waypoints.filter(
		(waypoint) => waypoint.phase === 'capture' && waypoint.detailCamera
	).length;
	return {
		name: suppliedOptions.name || 'Crag capture plan',
		cragName: suppliedOptions.cragName || '',
		previewWaypointIndex: waypoints[0].index,
		metadata: {
			...(suppliedOptions.startElevation !== undefined
				? { startElevation: suppliedOptions.startElevation }
				: {}),
			camera: options.camera,
			speed: options.speed,
			transitSpeed: options.transitSpeed,
			photoCount:
				waypoints.filter((waypoint) => waypoint.phase === 'capture').length + detailPhotoCount,
			detailPhotoCount,
			supplementaryWaypointCount: extraViews.length,
			gridWaypointCount: localWaypoints.length,
			captureOverlap: options.captureOverlap,
			coverageStatus:
				detectedWall.localPoints.length < 2
					? 'unresolved'
					: coveredTargetCount < coverageTargetCount || spacingGapCount > 0
						? 'partial'
						: 'modeled',
			spacingGapCount,
			coverageTargetCount,
			coveredTargetCount,
			uncoveredTargetCount: coverageTargetCount - coveredTargetCount,
			crestTargetCount: crestRows * pointsPerRow,
			coveredCrestTargetCount,
			pattern: options.pattern,
			strategy: 'single-grid-with-targeted-views',
			targetGsdCm: options.targetGsdCm,
			standOffMeters: options.standOffMeters,
			terrainSource: 'https://tiles.mapterhorn.com/tilejson.json',
			captureHeightMeters,
			sectorMinimumElevation: sectorElevation.minimum,
			sectorMaximumElevation: sectorElevation.maximum,
			stripSpacingMeters: stripSpacing,
			pointSpacingMeters: pointSpacing,
			clearanceMarginMeters: options.clearanceMarginMeters,
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
			coveragePasses: 1,
			obliqueOffsetMeters: options.obliqueOffsetMeters,
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
	if (!Number.isFinite(options.clearanceMarginMeters) || options.clearanceMarginMeters < 0)
		throw new TypeError('clearanceMarginMeters must be zero or greater.');
	if (
		!Number.isFinite(options.captureOverlap) ||
		options.captureOverlap < 0.5 ||
		options.captureOverlap > 0.9
	)
		throw new TypeError('captureOverlap must be between 0.5 and 0.9.');
	if (!Number.isFinite(options.targetGsdCm) || options.targetGsdCm <= 0)
		throw new TypeError('targetGsdCm must be greater than zero.');

	for (const key of [
		'stripSpacingMeters',
		'pointSpacingMeters',
		'speed',
		'transitSpeed'
	] as const) {
		const value = options[key];
		if ((key === 'pointSpacingMeters' || key === 'stripSpacingMeters') && value === undefined)
			continue;
		if (value === undefined || !Number.isFinite(value) || value <= 0) {
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
	if (!Number.isFinite(options.obliqueOffsetMeters) || options.obliqueOffsetMeters < 0) {
		throw new TypeError('obliqueOffsetMeters must be zero or greater.');
	}
	if (
		suppliedOptions.startElevation !== undefined &&
		!Number.isFinite(suppliedOptions.startElevation)
	) {
		throw new TypeError('Launch elevation must be a finite number in metres AMSL.');
	}
	if (options.camera === 'auto') {
		// Detail determines photo distance independently of minimum clearance.
		// A 45-degree crest view is sqrt(2) farther from its subject than a
		// normal view, so reserve that factor when estimating resolution.
		options.standOffMeters = Math.max(
			options.standOffMeters,
			cameraDistanceAtGsd('wide', options.targetGsdCm) / Math.SQRT2,
			options.minimumFaceDistanceMeters +
				2 * options.minimumGroundClearanceMeters +
				options.clearanceMarginMeters
		);
		options.camera = selectCoverageCamera(options.standOffMeters, options.targetGsdCm);
	}
	flightCamera(options.camera);
	if (suppliedOptions.obliqueOffsetMeters === undefined)
		options.obliqueOffsetMeters = options.standOffMeters * Math.tan(toRadians(20));
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
			(options.minimumFaceDistanceMeters +
				options.clearanceMarginMeters +
				options.terrainMeshSpacingMeters) /
				options.terrainMeshSpacingMeters
		) * options.terrainMeshSpacingMeters;
	const transitPad = Math.max(
		options.minimumFaceDistanceMeters + options.minimumGroundClearanceMeters,
		options.standOffMeters,
		10
	);
	const pad =
		transitPad +
		Math.max(options.standOffMeters, 10) +
		curve +
		options.obliqueOffsetMeters * (1 + curve / options.standOffMeters) +
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
