export type FlightWaypoint = {
	index: number;
	longitude: number;
	latitude: number;
	altitude: number;
	phase: 'capture' | 'transit';
	speed: number;
	heading: number;
	gimbalPitch: number;
	camera: string;
	action: string | null;
	photoInterval: number | null;
	triggerDistance: number | null;
	id?: string | number;
	relativeAltitude?: number;
	executeHeight?: number;
};

export type FlightPlanMetadata = {
	pattern: string;
	strategy: 'terrain-following-facade-with-convergent-pass';
	targetGsdCm: number;
	standOffMeters: number;
	terrainSource: string;
	captureHeightMeters: number;
	sectorMinimumElevation: number;
	sectorMaximumElevation: number;
	stripSpacingMeters: number;
	minimumFaceDistanceMeters: number;
	minimumGroundClearanceMeters: number;
	captureAltitudeToleranceMeters: number;
	lowestCaptureAltitude: number;
	captureAltitudeCeiling: number;
	altitudeCappedWaypointCount: number;
	unresolvedWallSurfaceCount: number;
	fragmentedRowCount: number;
	discardedFragmentWaypointCount: number;
	terrainMeshSpacingMeters: number;
	convergentPasses: number;
	convergentOffsetMeters: number;
	droppedWaypointCount: number;
	startElevation?: number;
	speed?: number;
	transitSpeed?: number;
	camera?: string;
	photoCount?: number;
	[key: string]: unknown;
};

export type FlightPlan = {
	name: string;
	cragName: string;
	filename?: string;
	metadata: FlightPlanMetadata;
	wallDetection: {
		confidence: number;
		averageSlope: number;
		shape: string;
		deviationMeters: number;
		coordinates: number[][];
		topCoordinates: number[][];
		samples: Array<{ coordinates: number[]; slope: number }>;
		[key: string]: unknown;
	};
	waypoints: FlightWaypoint[];
	previewWaypointIndex?: number | null;
};
