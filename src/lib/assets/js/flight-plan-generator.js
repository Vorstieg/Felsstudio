/**
 * Deterministic, terrain-relative capture plans for a sector footprint.
 *
 * A sector polygon supplies the face extent and the MapTerhorn DEM supplies the estimated 3D
 * surface. Capture height is the elevation difference between the sector vertices. We use the
 * longest axis for the capture curtain and reject waypoints that are too close to that sampled
 * terrain surface. Altitude in the result is AMSL.
 */

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
	photoInterval: 2,
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
	terrainElevationAt: () => 0
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const clamp = (number, lower, upper) => Math.max(lower, Math.min(upper, number));

function openRing(geometry) {
	if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0])) {
		throw new TypeError('A GeoJSON Polygon with a non-empty outer ring is required.');
	}
	const ring = geometry.coordinates[0].filter(
		(point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
	);
	if (ring.length < 3) throw new TypeError('The sector polygon needs at least three coordinates.');
	const first = ring[0];
	const last = ring[ring.length - 1];
	return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

function createProjection(ring) {
	const origin = ring.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
	origin[0] /= ring.length;
	origin[1] /= ring.length;
	const latitudeScale = toRadians(1) * EARTH_RADIUS_METERS;
	const longitudeScale = latitudeScale * Math.cos(toRadians(origin[1]));
	return {
		origin,
		toLocal: ([longitude, latitude]) => [
			(longitude - origin[0]) * longitudeScale,
			(latitude - origin[1]) * latitudeScale
		],
		toLngLat: ([x, y]) => [origin[0] + x / longitudeScale, origin[1] + y / latitudeScale]
	};
}

function principalAxis(points) {
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

function headingTo(target, from) {
	// Local x is east, y is north.  DJI heading is clockwise from north.
	return (toDegrees(Math.atan2(target[0] - from[0], target[1] - from[1])) + 360) % 360;
}

function normalFacingUphill(normal, center, standOffMeters, terrainAt) {
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

function sectorElevationRange(localRing, terrainAt) {
	// Sector vertices are the defined top and bottom bounds of the face. Heights
	// are all AMSL and their difference is the height the capture curtain covers.
	const elevations = localRing.map(terrainAt);
	return {
		minimum: Math.min(...elevations),
		maximum: Math.max(...elevations),
		height: Math.max(...elevations) - Math.min(...elevations)
	};
}

function crossSectionRange(localRing, axis, normal, along) {
	const intersections = [];
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

function smoothWallPoints(points) {
	return points.map((point, index) => {
		const nearby = points.slice(Math.max(0, index - 2), Math.min(points.length, index + 3));
		return {
			...point,
			across: nearby.reduce((sum, item) => sum + item.across, 0) / nearby.length,
			topAcross: nearby.reduce((sum, item) => sum + item.topAcross, 0) / nearby.length
		};
	});
}

function solveThreeByThree(matrix, values) {
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

function classifyWallCurvature(points) {
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

function detectWall(localRing, axis, normal, minAlong, maxAlong, options, terrainAt) {
	const alongStep = options.wallDetectionSpacingMeters;
	const crossSectionStep = options.wallDetectionCrossSectionSpacingMeters;
	const candidates = [];
	const steps = Math.max(1, Math.ceil((maxAlong - minAlong) / alongStep));

	for (let index = 0; index <= steps; index += 1) {
		const along = minAlong + ((maxAlong - minAlong) * index) / steps;
		const range = crossSectionRange(localRing, axis, normal, along);
		if (!range) continue;
		const [minimumAcross, maximumAcross] = range;
		const samples = Math.max(1, Math.ceil((maximumAcross - minimumAcross) / crossSectionStep));
		const slopeSamples = [];
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

function wallFrameAt(along, axis, normal, detectedWall) {
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

function wallSurfacePointAtHeight(base, top, height, terrainAt, options) {
	const baseElevation = terrainAt(base);
	if (height <= 0) return { local: base, elevation: baseElevation };
	const targetElevation = baseElevation + height;
	const spacing = options.wallSurfaceSampleSpacingMeters;
	const surfaceDistance = Math.hypot(top[0] - base[0], top[1] - base[1]);
	const sampleCount = Math.max(1, Math.ceil(surfaceDistance / spacing));
	let previous = { elevation: baseElevation, local: base };
	for (let sample = 1; sample <= sampleCount; sample += 1) {
		const local = [
			base[0] + ((top[0] - base[0]) * sample) / sampleCount,
			base[1] + ((top[1] - base[1]) * sample) / sampleCount
		];
		const elevation = terrainAt(local);
		if (elevation >= targetElevation) {
			const elevationSpan = elevation - previous.elevation;
			const fraction =
				elevationSpan === 0 ? 1 : (targetElevation - previous.elevation) / elevationSpan;
			return {
				local: [
					previous.local[0] + (local[0] - previous.local[0]) * fraction,
					previous.local[1] + (local[1] - previous.local[1]) * fraction
				],
				elevation: targetElevation
			};
		}
		previous = { elevation, local };
	}
	return null;
}

const subtract3 = (left, right) => [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
const dot3 = (left, right) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

function pointToTriangleDistance(point, first, second, third) {
	const firstToSecond = subtract3(second, first);
	const firstToThird = subtract3(third, first);
	const firstToPoint = subtract3(point, first);
	const firstSecondProjection = dot3(firstToSecond, firstToPoint);
	const firstThirdProjection = dot3(firstToThird, firstToPoint);
	if (firstSecondProjection <= 0 && firstThirdProjection <= 0)
		return Math.sqrt(dot3(firstToPoint, firstToPoint));

	const secondToPoint = subtract3(point, second);
	const secondFirstProjection = dot3(firstToSecond, secondToPoint);
	const secondThirdProjection = dot3(firstToThird, secondToPoint);
	if (secondFirstProjection >= 0 && secondThirdProjection <= secondFirstProjection)
		return Math.sqrt(dot3(secondToPoint, secondToPoint));

	const firstSecondEdge =
		firstSecondProjection * secondThirdProjection - secondFirstProjection * firstThirdProjection;
	if (firstSecondEdge <= 0 && firstSecondProjection >= 0 && secondFirstProjection <= 0) {
		const fraction = firstSecondProjection / (firstSecondProjection - secondFirstProjection);
		const nearest = firstToSecond.map((value, index) => first[index] + fraction * value);
		return Math.hypot(...subtract3(point, nearest));
	}

	const thirdToPoint = subtract3(point, third);
	const thirdFirstProjection = dot3(firstToThird, thirdToPoint);
	const thirdSecondProjection = dot3(firstToSecond, thirdToPoint);
	if (thirdFirstProjection >= 0 && thirdSecondProjection <= thirdFirstProjection)
		return Math.sqrt(dot3(thirdToPoint, thirdToPoint));

	const firstThirdEdge =
		thirdSecondProjection * firstThirdProjection - thirdFirstProjection * firstSecondProjection;
	if (firstThirdEdge <= 0 && firstThirdProjection >= 0 && thirdFirstProjection <= 0) {
		const fraction = firstThirdProjection / (firstThirdProjection - thirdFirstProjection);
		const nearest = firstToThird.map((value, index) => first[index] + fraction * value);
		return Math.hypot(...subtract3(point, nearest));
	}

	const secondThirdEdge =
		secondFirstProjection * thirdSecondProjection - thirdFirstProjection * secondThirdProjection;
	if (secondThirdEdge <= 0 && secondThirdProjection >= 0 && thirdSecondProjection <= 0) {
		const secondToThird = subtract3(third, second);
		const fraction = secondThirdProjection / (secondThirdProjection - thirdSecondProjection);
		const nearest = secondToThird.map((value, index) => second[index] + fraction * value);
		return Math.hypot(...subtract3(point, nearest));
	}

	const denominator = 1 / (firstSecondEdge + firstThirdEdge + secondThirdEdge);
	const secondWeight = firstThirdEdge * denominator;
	const thirdWeight = firstSecondEdge * denominator;
	const nearest = first.map(
		(value, index) =>
			value + firstToSecond[index] * secondWeight + firstToThird[index] * thirdWeight
	);
	return Math.hypot(...subtract3(point, nearest));
}

function terrainSurfaceClearance(
	local,
	altitude,
	terrainAt,
	minimumDistanceMeters,
	meshSpacingMeters
) {
	const radius = minimumDistanceMeters + meshSpacingMeters;
	const count = Math.ceil(radius / meshSpacingMeters);
	const points = new Map();
	const sample = (x, y) => {
		const key = `${x}:${y}`;
		if (!points.has(key)) points.set(key, [x, y, terrainAt([x, y])]);
		return points.get(key);
	};
	let minimum = Infinity;
	const aircraft = [local[0], local[1], altitude];
	for (let y = -count; y < count; y += 1) {
		for (let x = -count; x < count; x += 1) {
			const west = local[0] + x * meshSpacingMeters;
			const south = local[1] + y * meshSpacingMeters;
			const southwest = sample(west, south);
			const southeast = sample(west + meshSpacingMeters, south);
			const northwest = sample(west, south + meshSpacingMeters);
			const northeast = sample(west + meshSpacingMeters, south + meshSpacingMeters);
			minimum = Math.min(
				minimum,
				pointToTriangleDistance(aircraft, southwest, southeast, northeast),
				pointToTriangleDistance(aircraft, southwest, northeast, northwest)
			);
		}
	}
	return minimum;
}

function createWaypoint(local, altitude, phase, options, target, action, index, projection) {
	const [longitude, latitude] = projection.toLngLat(local);
	return {
		index,
		longitude,
		latitude,
		altitude,
		phase,
		speed: phase === 'transit' ? options.transitSpeed : options.speed,
		heading: headingTo(target, local),
		gimbalPitch: phase === 'transit' ? -25 : -8,
		camera: options.camera,
		action,
		photoInterval: phase === 'capture' ? options.photoInterval : null,
		triggerDistance: phase === 'capture' ? options.pointSpacingMeters : null
	};
}

/**
 * Create a terrain-following façade mission with a direct coverage pass and optional convergent
 * pass. The latter shifts the aircraft laterally while looking back to the same surface samples,
 * giving SfM a useful second viewing angle without changing the planned coverage grid.
 */
export function generateFlightPlan(geometry, suppliedOptions = {}) {
	const options = { ...DEFAULTS, ...suppliedOptions };
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
	const ring = openRing(geometry);
	const projection = createProjection(ring);
	const localRing = ring.map(projection.toLocal);
	const axis = principalAxis(localRing);
	const principalNormal = [-axis[1], axis[0]];
	const extentAlong = localRing.map((point) => point[0] * axis[0] + point[1] * axis[1]);
	const minAlong = Math.min(...extentAlong);
	const maxAlong = Math.max(...extentAlong);
	const center = [0, 0]; // projection origin is the polygon centroid
	const terrainAt = (local) => {
		const [longitude, latitude] = projection.toLngLat(local);
		const elevation = Number(options.terrainElevationAt(longitude, latitude));
		if (!Number.isFinite(elevation))
			throw new TypeError('terrainElevationAt must return a finite elevation.');
		return elevation;
	};
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
	let waypoints = [];
	let droppedWaypointCount = 0;
	let unresolvedWallSurfaceCount = 0;

	for (let pass = 0; pass < options.convergentPasses; pass += 1) {
		const lateralOffset =
			pass === 0 ? 0 : (pass % 2 === 1 ? 1 : -1) * options.convergentOffsetMeters;
		for (let row = 0; row < rowCount; row += 1) {
			const height = (row / (rowCount - 1)) * captureHeightMeters;
			const rowWaypoints = [];
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
				// Shift a convergent constant-distance pass along the wall before
				// applying the local normal, preserving its horizontal stand-off.
				const frameAlong =
					options.pattern === 'constant-distance-grid' ? along + lateralOffset : along;
				const wallFrame = wallFrameAt(frameAlong, axis, normal, detectedWall);
				const surfacePoint =
					options.pattern === 'constant-distance-grid'
						? wallSurfacePointAtHeight(
								wallFrame.target,
								wallFrame.topTarget,
								height,
								terrainAt,
								options
							)
						: null;
				if (options.pattern === 'constant-distance-grid' && !surfacePoint) {
					unresolvedWallSurfaceCount += 1;
					continue;
				}
				const target = surfacePoint?.local || wallFrame.target;
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
				const clearance = terrainSurfaceClearance(
					local,
					altitude,
					terrainAt,
					options.minimumFaceDistanceMeters,
					options.terrainMeshSpacingMeters
				);
				if (clearance < options.minimumFaceDistanceMeters) {
					droppedWaypointCount += 1;
					continue;
				}
				rowWaypoints.push(
					createWaypoint(
						local,
						altitude,
						'capture',
						options,
						target,
						'photo',
						waypoints.length,
						projection
					)
				);
			}
			rowWaypoints.forEach((waypoint, index) => {
				waypoint.index = waypoints.length;
				waypoint.captureRow = `${pass}:${row}`;
				waypoint.captureOrder = index;
				waypoint.action =
					rowWaypoints.length === 1
						? 'photo'
						: index === 0
							? 'startInterval'
							: index === rowWaypoints.length - 1
								? 'stopInterval'
								: 'photo';
				waypoints.push(waypoint);
			});
		}
	}
	if (waypoints.length < 2) {
		throw new RangeError(
			`No usable flight path remains after enforcing the ${options.minimumFaceDistanceMeters} m cliff-face clearance.`
		);
	}
	const lowestCaptureAltitude = Math.min(...waypoints.map((waypoint) => waypoint.altitude));
	const captureAltitudeCeiling =
		lowestCaptureAltitude + captureHeightMeters + options.captureAltitudeToleranceMeters;
	const altitudeCappedWaypointCount = waypoints.filter(
		(waypoint) => waypoint.altitude > captureAltitudeCeiling
	).length;
	waypoints = waypoints.filter((waypoint) => waypoint.altitude <= captureAltitudeCeiling);
	const clippedRows = new Map();
	waypoints.forEach((waypoint) => {
		const row = clippedRows.get(waypoint.captureRow) || [];
		row.push(waypoint);
		clippedRows.set(waypoint.captureRow, row);
	});
	const replannedRows = [];
	let fragmentedRowCount = 0;
	let discardedFragmentWaypointCount = 0;
	for (const row of clippedRows.values()) {
		const segments = row.reduce((all, waypoint) => {
			const current = all[all.length - 1];
			if (!current || waypoint.captureOrder !== current[current.length - 1].captureOrder + 1) {
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
	waypoints = [];
	let previousWaypoint = null;
	for (const row of replannedRows) {
		const first = row[0];
		const last = row[row.length - 1];
		const shouldReverse =
			previousWaypoint &&
			Math.hypot(
				last.longitude - previousWaypoint.longitude,
				last.latitude - previousWaypoint.latitude
			) <
				Math.hypot(
					first.longitude - previousWaypoint.longitude,
					first.latitude - previousWaypoint.latitude
				);
		const plannedRow = shouldReverse ? [...row].reverse() : row;
		plannedRow.forEach((waypoint, rowIndex) => {
			waypoint.index = waypoints.length;
			waypoint.action =
				plannedRow.length === 1
					? 'photo'
					: rowIndex === 0
						? 'startInterval'
						: rowIndex === plannedRow.length - 1
							? 'stopInterval'
							: 'photo';
			delete waypoint.captureRow;
			delete waypoint.captureOrder;
			waypoints.push(waypoint);
		});
		previousWaypoint = plannedRow[plannedRow.length - 1];
	}
	if (waypoints.length < 2) {
		throw new RangeError(
			`No usable flight path remains after enforcing the ${options.minimumFaceDistanceMeters} m cliff-face clearance.`
		);
	}
	return {
		name: suppliedOptions.name || 'Crag capture plan',
		cragName: suppliedOptions.cragName || '',
		metadata: {
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
